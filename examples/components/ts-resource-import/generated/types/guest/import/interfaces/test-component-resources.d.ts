declare module 'test:component/resources' {
  
  export class Example implements Disposable {
    constructor()
    hello(a: string): string;
    [Symbol.dispose](): void;
  }
}
