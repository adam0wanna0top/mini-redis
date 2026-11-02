// 入口文件：没有 main()，Node 从这里的第一行开始往下执行。
// 执行到文件末尾后，进程并不会退出——因为 server 还在监听端口，
// 事件循环里还有"待处理的工作"。

import { Server } from "./server.ts";

// 默认用 6380，避免和你可能装的真 Redis（6379）冲突
const port = Number(process.env.PORT ?? 6380);

const server = new Server();
const t0 = performance.now();
const p = server.listen(port);
console.log("await 之前:", p);
await p;
const t1 = performance.now();
console.log("await 之后:", p);
console.log(`listen 耗时 ${(t1 - t0).toFixed(3)} ms`);
console.log(`mini-redis listening on :${port}  (pid ${process.pid})`);
console.log(`试试：nc localhost ${port}`);

// Ctrl+C → SIGINT。相当于 C 里的 signal(SIGINT, handler)，
// 但 handler 是在事件循环里被正常调用的，可以放心做任何事。
process.on("SIGINT", async () => 
{
  console.log("\n正在关闭...");
  await server.close();
  // 这里不用调用 process.exit()：所有连接和监听都关掉后，事件循环空了，进程自然退出。
  // 阶段 4 会在这里加上"先把 AOF 刷盘"。
});

console.log("事件循环中的资源:", process.getActiveResourcesInfo());
