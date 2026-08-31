export type ConsoleStream = "stdout" | "stderr";

export interface ConsoleHost {
  write(stream: ConsoleStream, value: string): void;
  isTerminal(stream: ConsoleStream): boolean;
  colorDepth(stream: ConsoleStream): number;
}
