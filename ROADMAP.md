# mini-redis 路线图

目标：用 TypeScript 写一个能被真正的 `redis-cli` / `redis-benchmark` 连接的 Redis 克隆。
每个阶段都能独立运行。完成一个阶段就 `git commit` 并打 tag（`stage-1`、`stage-2`…）。

---

## 阶段 1：TCP echo server ✅（骨架已提供）

- `node:net` 创建 TCP 服务器，收到什么就回什么。
- 观察：一个线程如何同时服务多个 `nc` 连接（开 3 个终端试试）。
- 对照 C：`net.createServer` ≈ `socket/bind/listen` + `epoll` 循环；
  `socket.on('data', cb)` ≈ `EPOLLIN` 就绪后的回调。
- **思考题**：在 `data` 回调里写一个 `while (Date.now() < t + 5000) {}`，其他连接会怎样？为什么？

## 阶段 2：RESP 协议 + PING / ECHO / GET / SET

- 读 RESP 协议规范（搜 "Redis serialization protocol specification"）。
  客户端发来的命令都是"数组 of 批量字符串"，例如 `SET k v`：
  ```
  *3\r\n$3\r\nSET\r\n$1\r\nk\r\n$1\r\nv\r\n
  ```
- 写 `src/resp.ts`：
  - `encode(value)`：把 TS 值编码为 RESP（`+OK`、`-ERR`、`:1`、`$3\r\nfoo`、`*2...`、`$-1` 空值）。
  - `Parser` 类：**处理 TCP 粘包/半包**——`data` 事件给你的 Buffer 可能只有半条命令，也可能有三条。
    思路：维护一个累积缓冲区，能解析出完整命令就解析，不完整就等下一个 `data`。
- 写 `src/commands.ts`：命令名 → 处理函数 的表（`Map<string, Handler>`）。
- 存储：一个模块级的 `Map<string, Buffer>`。
- **验收**：`brew install redis` 后，`redis-cli -p 6380 set a 1` / `get a` 正常工作。
- **思考题**：为什么 Redis 单线程却不需要给这个 Map 加锁？

## 阶段 3：更多数据类型 + 过期

- 加 `DEL`、`EXISTS`、`INCR`、`KEYS`，以及 List（`LPUSH`/`LRANGE`）、Hash（`HSET`/`HGET`）。
  用 TS 的**联合类型**表示值：`type Value = { type: 'string', ... } | { type: 'list', ... }`，
  体会类型收窄（narrowing），对应 `WRONGTYPE` 错误。
- `EXPIRE` / `TTL` / `SET k v PX 100`：
  - 惰性删除：访问时检查是否过期。
  - 定期删除：`setInterval` 每 100ms 随机抽一批 key 检查（模仿真 Redis 的算法）。
- **思考题**：为什么不给每个 key 开一个 `setTimeout`？（10 万个 key 会怎样？）

## 阶段 4：持久化

- **AOF**：每条写命令追加到 `appendonly.aof`。
  - 用 `fs.createWriteStream`，理解**写入缓冲与背压**（`write()` 返回 false 时意味着什么）。
  - 三种刷盘策略：`always` / `everysec` / `no`，对应 `fsync` 的时机。
  - 启动时重放 AOF 恢复数据。
- **RDB 快照**（`SAVE` / `BGSAVE`）：
  - 自定义一个二进制格式，用 `Buffer` 手动写长度前缀——非常 C 风格。
  - `BGSAVE` 的难点：真 Redis 用 `fork()` 利用写时复制拿到一致快照。Node 不能 fork 当前内存。
    方案：分批序列化 + `setImmediate` 让出事件循环，或把数据发给 Worker 去写。
    **这一步会让你真正理解"为什么不能阻塞事件循环"**。

## 阶段 5：Pub/Sub 与阻塞命令

- `SUBSCRIBE` / `PUBLISH`：连接进入"订阅模式"，每个连接需要自己的状态 → `Client` 类。
- `BLPOP key timeout`：没有数据时"阻塞"客户端——但不能阻塞线程！
  思路：把该客户端挂进等待队列，`LPUSH` 时唤醒。这就是**用回调实现条件变量**。
- `MULTI` / `EXEC`：事务队列。思考：单线程下 `EXEC` 天然原子。

## 阶段 6：性能

- `redis-benchmark -p 6380 -t set,get -n 100000 -c 50`，和真 Redis 对比 QPS。
- 支持 **pipelining**：一个 `data` 里多条命令，回复要合并一次写出（减少系统调用）。
- 用 `node --cpu-prof` 找热点；优化 Buffer 解析，避免不必要的 `toString()` 与拷贝。
- 观察 GC 对延迟的影响（`--trace-gc`）。

## 阶段 7：主从复制

- `REPLICAOF host port`：从节点连上主节点，先接收全量快照，再接收增量命令流。
- 两个进程、一条 TCP 连接、一个复制偏移量（offset）。
- **验收**：在主节点写，从节点能读到；`kill -9` 从节点后重连能追上。

## 阶段 8（可选）：多线程实验

- 用 `worker_threads` 实现 I/O 线程（类似 Redis 6 的 io-threads）：Worker 负责解析，主线程执行命令。
- 用 `SharedArrayBuffer` + `Atomics` 做一次真正的共享内存加锁实验——这是 JS 里唯一像 C 的地方。
- 结论对比：多线程到底快了没有？为什么？
