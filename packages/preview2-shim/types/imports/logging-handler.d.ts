export namespace LoggingHandler {
  export function /**
   * Emit a log message.
   * 
   * A log message has a `level` describing what kind of message is being
   * sent, a context, which is an uninterpreted string meant to help
   * consumers group similar messages, and a string containing the message
   * text.
   */
  log(level: Level, context: string, message: string): void;
}
/**
 * A log level, describing a kind of message.
 * 
 * # Variants
 * 
 * ## `"trace"`
 * 
 * Describes messages about the values of variables and the flow of
 * control within a program.
 * 
 * ## `"debug"`
 * 
 * Describes messages likely to be of interest to someone debugging a
 * program.
 * 
 * ## `"info"`
 * 
 * Describes messages likely to be of interest to someone monitoring a
 * program.
 * 
 * ## `"warn"`
 * 
 * Describes messages indicating hazardous situations.
 * 
 * ## `"error"`
 * 
 * Describes messages indicating serious errors.
 */
export type Level = 'trace' | 'debug' | 'info' | 'warn' | 'error';
