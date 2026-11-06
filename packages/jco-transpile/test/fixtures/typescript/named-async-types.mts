import type { ByteStream, Ready } from './named-async-types.js';
import type {
    Message,
    MessageStream,
    MessageFuture,
    SignalStream,
    SignalFuture,
} from './interfaces/test-named-async-types-types.js';
import type {
    MessageStream as PipelineStream,
    MessageFuture as PipelineFuture,
} from './interfaces/test-named-async-types-pipeline.js';

function expectType<T>(_value: T): void {}

declare const bytes: ByteStream;
declare const ready: Ready;
declare const messages: MessageStream;
declare const message: MessageFuture;
declare const signals: SignalStream;
declare const signal: SignalFuture;
declare const pipelineStream: PipelineStream;
declare const pipelineFuture: PipelineFuture;

expectType<AsyncIterable<number>>(bytes);
expectType<PromiseLike<void>>(ready);
expectType<AsyncIterable<Message>>(messages);
expectType<PromiseLike<Message>>(message);
expectType<AsyncIterable<void>>(signals);
expectType<PromiseLike<void>>(signal);

// Plain promises and async iterables remain valid host-provided values.
declare const byteSource: AsyncIterable<number>;
declare const messageSource: AsyncIterable<Message>;
declare const signalSource: AsyncIterable<void>;
expectType<ByteStream>(byteSource);
expectType<Ready>(Promise.resolve());
expectType<MessageStream>(messageSource);
expectType<MessageFuture>(Promise.resolve({ text: 'hello' }));
expectType<SignalStream>(signalSource);
expectType<SignalFuture>(Promise.resolve());

// Imported aliases remain interchangeable with their defining interface's types.
expectType<MessageStream>(pipelineStream);
expectType<PipelineStream>(messages);
expectType<MessageFuture>(pipelineFuture);
expectType<PipelineFuture>(message);

ready[Symbol.dispose]?.();
message[Symbol.dispose]?.();
signal[Symbol.dispose]?.();

// Payload types must not be erased or confused with the other async kind.
// @ts-expect-error A byte stream does not yield strings.
expectType<AsyncIterable<string>>(bytes);
// @ts-expect-error A message future does not resolve to a number.
expectType<PromiseLike<number>>(message);
// @ts-expect-error A future is not a stream.
expectType<MessageStream>(message);
