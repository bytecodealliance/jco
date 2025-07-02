//! Intrinsics that represent helpers that deal with Component Model resources

use crate::intrinsics::Intrinsic;
use crate::source::Source;

/// This enum contains intrinsics for supporting Component Model resources
#[derive(Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum ResourceIntrinsic {
    /// # Resource table slab implementation
    ///
    /// Resource table slab implementation on top of a fixed "SMI" array in JS engines,
    /// a fixed contiguous array of u32s, for performance. We don't use a typed array because
    /// we need resizability without reserving a large buffer.
    ///
    /// The flag bit for all data values is 1 << 30. We avoid the use of the highest bit
    /// entirely to not trigger SMI deoptimization.
    ///
    /// Each entry consists of a pair of u32s, either a free list entry, or a data entry.
    ///
    /// ## Free List Entries:
    ///
    ///  |    index (x, u30)   |       ~unused~      |
    ///  |------ 32 bits ------|------ 32 bits ------|
    ///  | 01xxxxxxxxxxxxxxxxx | ################### |
    ///
    /// Free list entries use only the first value in the pair, with the high bit always set
    /// to indicate that the pair is part of the free list. The first pair of entries at
    /// indices 0 and 1 is the free list head, with the initial values of 1 << 30 and 0
    /// respectively. Removing the 1 << 30 flag gives 0, which indicates the end of the free
    /// list.
    ///
    /// ## Data Entries:
    ///
    ///  |    scope (x, u30)   | own(o), rep(x, u30) |
    ///  |------ 32 bits ------|------ 32 bits ------|
    ///  | 00xxxxxxxxxxxxxxxxx | 0oxxxxxxxxxxxxxxxxx |
    ///
    /// Data entry pairs consist of a first u30 scope entry and a second rep entry. The field
    /// is only called the scope for interface shape consistency, but is actually used for the
    /// ref count for own handles and the scope id for borrow handles. The high bit is never
    /// set for this first entry to distinguish the pair from the free list. The second item
    /// in the pair is the rep for  the resource, with the high bit in this entry indicating
    /// if it is an own handle.
    ///
    /// The free list numbering and the handle numbering are the same, indexing by pair, so to
    /// get from a handle or free list numbering to an index, we multiply by two.
    ///
    /// For example, to access a handle n, we read the pair of values n * 2 and n * 2 + 1 in
    /// the array to get the context and rep respectively. If the high bit is set on the
    /// context, we throw for an invalid handle. The rep value is masked out from the
    /// ownership high bit, also throwing for an invalid zero rep.
    ///
    ResourceTableFlag,
    ResourceTableCreateBorrow,
    ResourceTableCreateOwn,
    ResourceTableGet,
    ResourceTableEnsureBorrowDrop,
    ResourceTableRemove,
    ResourceCallBorrows,
    ResourceTransferBorrow,
    ResourceTransferBorrowValidLifting,
    ResourceTransferOwn,
    CurResourceBorrows,
}

impl ResourceIntrinsic {
    /// Retrieve dependencies for this intrinsic
    pub fn deps() -> &'static [&'static Intrinsic] {
        &[]
    }

    /// Retrieve global names for
    pub fn get_global_names() -> impl IntoIterator<Item = &'static str> {
        [
            "resourceCallBorrows",
            "resourceTransferBorrow",
            "resourceTransferBorrowValidLifting",
            "resourceTransferOwn",
            "rscTableCreateBorrow",
            "rscTableCreateOwn",
            "rscTableGet",
            "rscTableRemove",
            "rscTableTryGet",
            "curResourceBorrows",
        ]
    }

    /// Get the name for the intrinsic
    pub fn name(&self) -> &'static str {
        match self {
            Self::ResourceCallBorrows => "resourceCallBorrows",
            Self::ResourceTableFlag => "T_FLAG",
            Self::ResourceTableCreateBorrow => "rscTableCreateBorrow",
            Self::ResourceTableCreateOwn => "rscTableCreateOwn",
            Self::ResourceTableGet => "rscTableGet",
            Self::ResourceTableEnsureBorrowDrop => "rscTableTryGet",
            Self::ResourceTableRemove => "rscTableRemove",
            Self::ResourceTransferBorrow => "resourceTransferBorrow",
            Self::ResourceTransferBorrowValidLifting => "resourceTransferBorrowValidLifting",
            Self::ResourceTransferOwn => "resourceTransferOwn",
            Self::CurResourceBorrows => "curResourceBorrows",
        }
    }

    /// Render an intrinsic to a string
    pub fn render(&self, output: &mut Source) {
        match self {
            Self::CurResourceBorrows => output.push_str(
                "
                let curResourceBorrows = [];
            ",
            ),

            Self::ResourceTableFlag => output.push_str(
                "
                const T_FLAG = 1 << 30;
            ",
            ),

            Self::ResourceTableCreateBorrow => output.push_str(
                "
                function rscTableCreateBorrow (table, rep) {
                    const free = table[0] & ~T_FLAG;
                    if (free === 0) {
                        table.push(scopeId);
                        table.push(rep);
                        return (table.length >> 1) - 1;
                    }
                    table[0] = table[free];
                    table[free << 1] = scopeId;
                    table[(free << 1) + 1] = rep;
                    return free;
                }
            ",
            ),

            Self::ResourceTableCreateOwn => output.push_str(
                "
                function rscTableCreateOwn (table, rep) {
                    const free = table[0] & ~T_FLAG;
                    if (free === 0) {
                        table.push(0);
                        table.push(rep | T_FLAG);
                        return (table.length >> 1) - 1;
                    }
                    table[0] = table[free << 1];
                    table[free << 1] = 0;
                    table[(free << 1) + 1] = rep | T_FLAG;
                    return free;
                }
            ",
            ),

            Self::ResourceTableGet => output.push_str(
                "
                function rscTableGet (table, handle) {
                    const scope = table[handle << 1];
                    const val = table[(handle << 1) + 1];
                    const own = (val & T_FLAG) !== 0;
                    const rep = val & ~T_FLAG;
                    if (rep === 0 || (scope & T_FLAG) !== 0) throw new TypeError('Invalid handle');
                    return { rep, scope, own };
                }
            ",
            ),

            Self::ResourceTableEnsureBorrowDrop => output.push_str(
                "
                function rscTableEnsureBorrowDrop (table, handle, scope) {
                    if (table[handle << 1] === scope)
                        throw new TypeError('Resource borrow was not dropped at end of call');
                }
            ",
            ),

            Self::ResourceTableRemove => output.push_str(
                "
                function rscTableRemove (table, handle) {
                    const scope = table[handle << 1];
                    const val = table[(handle << 1) + 1];
                    const own = (val & T_FLAG) !== 0;
                    const rep = val & ~T_FLAG;
                    if (val === 0 || (scope & T_FLAG) !== 0) throw new TypeError('Invalid handle');
                    table[handle << 1] = table[0] | T_FLAG;
                    table[0] = handle | T_FLAG;
                    return { rep, scope, own };
                }
            ",
            ),

            Self::ResourceTransferBorrow => {
                let handle_tables = Intrinsic::HandleTables.name();
                let resource_borrows = Self::ResourceCallBorrows.name();
                let rsc_table_remove = Self::ResourceTableRemove.name();
                let rsc_table_create_borrow = Self::ResourceTableCreateBorrow.name();
                let defined_resource_tables = Intrinsic::DefinedResourceTables.name();
                output.push_str(&format!("
                    function resourceTransferBorrow(handle, fromTid, toTid) {{
                        const fromTable = {handle_tables}[fromTid];
                        const fromHandle = fromTable[(handle << 1) + 1];
                        const isOwn = (fromHandle & T_FLAG) !== 0;
                        const rep = isOwn ? fromHandle & ~T_FLAG : {rsc_table_remove}(fromTable, fromHandle).rep;
                        if ({defined_resource_tables}[toTid]) return rep;
                        const toTable = {handle_tables}[toTid] || ({handle_tables}[toTid] = [T_FLAG, 0]);
                        const newHandle = {rsc_table_create_borrow}(toTable, rep);
                        {resource_borrows}.push({{ rid: toTid, handle: newHandle }});
                        return newHandle;
                    }}
                "));
            }

            Self::ResourceTransferBorrowValidLifting => {
                let handle_tables = Intrinsic::HandleTables.name();
                let rsc_table_remove = Self::ResourceTableRemove.name();
                let rsc_table_create_borrow = Self::ResourceTableCreateBorrow.name();
                let defined_resource_tables = Intrinsic::DefinedResourceTables.name();
                output.push_str(&format!("
                    function resourceTransferBorrowValidLifting(handle, fromTid, toTid) {{
                        const fromTable = {handle_tables}[fromTid];
                        const isOwn = (fromTable[(handle << 1) + 1] & T_FLAG) !== 0;
                        const rep = isOwn ? fromTable[(handle << 1) + 1] & ~T_FLAG : {rsc_table_remove}(fromTable, handle).rep;
                        if ({defined_resource_tables}[toTid]) return rep;
                        const toTable = {handle_tables}[toTid] || ({handle_tables}[toTid] = [T_FLAG, 0]);
                        return {rsc_table_create_borrow}(toTable, rep);
                    }}
                "));
            }

            Self::ResourceTransferOwn => {
                let handle_tables = Intrinsic::HandleTables.name();
                let rsc_table_remove = Self::ResourceTableRemove.name();
                let rsc_table_create_own = Self::ResourceTableCreateOwn.name();
                output.push_str(&format!("
                    function resourceTransferOwn(handle, fromTid, toTid) {{
                        const {{ rep }} = {rsc_table_remove}({handle_tables}[fromTid], handle);
                        const toTable = {handle_tables}[toTid] || ({handle_tables}[toTid] = [T_FLAG, 0]);
                        return {rsc_table_create_own}(toTable, rep);
                    }}
                "));
            }

            Self::ResourceCallBorrows => output.push_str("let resourceCallBorrows = [];"),
        }
    }
}
