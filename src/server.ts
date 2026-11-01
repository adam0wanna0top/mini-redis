// 阶段 1：TCP echo server
//
// 对照 C 的写法：
//   int fd = socket(...); bind(fd, ...); listen(fd, ...);
//   for (;;) { n = epoll_wait(...); for each ready fd: accept / read / write }
// 在 Node 里，这个 for(;;) 循环由运行时（libuv）替你写好了，
// 你只需要注册"某件事发生时调用哪个函数"。

import net from "node:net";

// 每个连接一个对象。阶段 5 会给它加上订阅状态、事务队列等。
// 注意：没有析构函数，连接关闭后只要没人再引用它，GC 会回收。
class Client {
  readonly id: number;
  readonly socket: net.Socket;

  constructor(id: number, socket: net.Socket) {
    this.id = id;
    this.socket = socket;
  }

  get addr(): string {
    return `${this.socket.remoteAddress}:${this.socket.remotePort}`;
  }
}

export class Server {
  private readonly tcp: net.Server;
  // 所有连接都在同一个线程里被访问，所以这里不需要锁。
  private readonly clients = new Set<Client>();
  private nextId = 1;

  constructor() {
    // 相当于：每当 accept() 返回一个新 fd，就调用这个函数
    this.tcp = net.createServer((socket) => this.onConnection(socket));
  }

  listen(port: number): Promise<void> {
    // listen 是异步的：调用后立即返回，真正绑定成功时才 resolve
    return new Promise((resolve, reject) => {
      this.tcp.once("error", reject);
      this.tcp.listen(port, () => resolve());
    });
  }

  close(): Promise<void> {
    for (const c of this.clients) c.socket.destroy();
    return new Promise((resolve) => this.tcp.close(() => resolve()));
  }

  private onConnection(socket: net.Socket): void {
    const client = new Client(this.nextId++, socket);
    this.clients.add(client);
    console.log(`[+] client #${client.id} ${client.addr}  (在线 ${this.clients.size})`);

    // 'data' ≈ EPOLLIN 就绪后 read() 到的数据。
    // 注意：TCP 是字节流，chunk 可能是半条消息，也可能是好几条——阶段 2 要处理这个问题。
    socket.on("data", (chunk: Buffer) => {
      console.log(`    #${client.id} 收到 ${chunk.length} 字节: ${JSON.stringify(chunk.toString())}`);
      // TODO(阶段 2)：把 chunk 交给 RESP 解析器，执行命令，回写 RESP 格式的回复
      socket.write(chunk);
    });

    socket.on("close", () => {
      this.clients.delete(client);
      console.log(`[-] client #${client.id} 断开  (在线 ${this.clients.size})`);
    });

    // 不监听 'error' 的话，对端异常断开（ECONNRESET）会让整个进程崩溃
    socket.on("error", (err) => {
      console.log(`    #${client.id} error: ${err.message}`);
    });
  }
}
