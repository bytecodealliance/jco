// Test-only composition of actual selected constructors and live state owners.
import * as future from '../src/intrinsics/future.js';
import { create as createComponent } from './component-helpers.js';
import type { FuturePayloadEnd, FutureHostInjectContext } from '../src/runtime.js';
export function create() {
    const selected = createComponent();
    const { core, component, lookup } = selected;
    const FutureValue = future.initializeFutureValueClass();
    const FutureEnd = future.initializeFutureEndClass(core.asyncEventCode);
    const common = {
        RuntimeError: core.RuntimeError,
        FutureEnd,
        FutureValue,
        buffers: core.bufferManager,
        events: core.asyncEventCode,
    };
    const FutureReadableEnd = future.initializeFutureReadableEndClass({ ...common, lookup });
    const FutureWritableEnd = future.initializeFutureWritableEndClass(common);
    const InternalFuture = future.initializeInternalFutureClass({ FutureReadableEnd, FutureWritableEnd });
    const futures = future.initializeFutures(core.RepTable),
        tables = future.initializeFutureTables();
    const tableContext = { tables, lookup, FutureEnd, RuntimeError: core.RuntimeError };
    const ends = { ...tableContext, RuntimeError: core.RuntimeError };
    const creation = { tables, futures, InternalFuture };
    const nestedSymbol = future.initializeNestedFutureSymbol();
    const injection: FutureHostInjectContext = {
        nestedSymbol,
        hasOwnProperty: core.hasOwnProperty,
        disposeSymbol: core.symbolDispose,
        tracking: {
            RuntimeError: core.RuntimeError,
            storeTrap: component.storeTrap,
            storeAsyncState: component.storeAsyncState,
            asyncState: component.asyncState,
            symbolDispose: core.symbolDispose,
        },
    };
    const HostFuture = future.initializeHostFutureClass({ RuntimeError: core.RuntimeError, lookup, ends });
    return {
        ...selected,
        FutureValue,
        FutureEnd,
        FutureReadableEnd,
        FutureWritableEnd,
        InternalFuture,
        HostFuture,
        futures,
        tables,
        tableContext,
        ends,
        creation,
        nestedSymbol,
        injection,
        addTable(componentIdx: number, tableIdx: number) {
            tables[tableIdx] = {
                componentIdx,
                table: new core.RepTable<FuturePayloadEnd>({ target: `future table ${tableIdx}` }),
            };
            return component.getOrCreateAsyncState(componentIdx);
        },
    };
}
