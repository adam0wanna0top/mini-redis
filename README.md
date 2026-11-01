# mini redis

用 TypeScript 从零实现一个 Redis 克隆，目标是能被真正的 `redis-cli` / `redis-benchmark` 连接。
这是一个学习项目：通过它理解 Node.js 的单线程 + 事件循环模型。

## 运行

需要 Node.js 24+（直接运行 `.ts`，无需编译）。

```bash
npm install      # 只装类型检查用的 typescript / @types/node
npm start        # 监听 6380 端口（可用 PORT 环境变量修改）
npm run dev      # 改代码自动重启
npm run typecheck
```

另开终端测试：

```bash
nc localhost 6380
```

## 进度

详见 [ROADMAP.md](ROADMAP.md)。

- [x] 阶段 1：TCP echo server
- [ ] 阶段 2：RESP 协议 + PING / ECHO / GET / SET
- [ ] 阶段 3：更多数据类型 + 过期
- [ ] 阶段 4：持久化（AOF / RDB）
- [ ] 阶段 5：Pub/Sub 与阻塞命令
- [ ] 阶段 6：性能
- [ ] 阶段 7：主从复制
- [ ] 阶段 8：多线程实验
