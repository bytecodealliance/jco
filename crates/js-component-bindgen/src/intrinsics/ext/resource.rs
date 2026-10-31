//! Named resource operations, storage owners, and remaining inline capabilities.
use super::{RuntimeContext, RuntimeImport, RuntimeImportKind};
use crate::intrinsics::Intrinsic;

pub(crate) fn resource_import(
    intrinsic: crate::intrinsics::resource::ResourceIntrinsic,
) -> RuntimeImport {
    use crate::intrinsics::resource::ResourceIntrinsic::*;
    use RuntimeContext as C;
    use RuntimeImportKind as K;
    let (export, context, kind) = match intrinsic {
        ResourceTableFlag => ("tableFlag", None, K::Value),
        ResourceTableOwnFlag => ("tableOwn", None, K::Value),
        HandleIndexSpaces => (
            "initializeHandleIndexSpaces",
            Some(C::HandleIndexSpaces),
            K::InitializedValue,
        ),
        GetHandleIndexSpace => ("getHandleIndexSpace", Some(C::HandleIndexSpaces), K::Call),
        ResourceTableCreateBorrow => ("tableCreateBorrow", Some(C::HandleIndexSpaces), K::Call),
        ResourceTableCreateOwn => ("tableCreateOwn", Some(C::HandleIndexSpaces), K::Call),
        ResourceTableGet => ("tableGet", Some(C::ResourceTableGet), K::Call),
        ResourceTableEnsureBorrowDrop => ("tableEnsureBorrowDrop", None, K::Call),
        ResourceTableRemove => ("tableRemove", Some(C::ResourceRemove), K::Call),
        ResourceCallBorrows => (
            "initializeCallBorrows",
            Some(C::CallBorrows),
            K::LiveReference {
                expression: "_jcoCallBorrowContext.borrows",
            },
        ),
        ResourceScopeCounter => (
            "initializeResourceScopeCounter",
            Some(C::ResourceScopeCounter),
            K::LiveReference {
                expression: "_jcoResourceScopeCounterContext.value",
            },
        ),
        ResourceScopeTasks => (
            "initializeResourceScopeTasks",
            Some(C::ResourceScopeTasks),
            K::InitializedValue,
        ),
        ResourceTransferBorrow => ("transferBorrow", Some(C::ResourceTransferBorrow), K::Call),
        ResourceTransferBorrowValidLifting => (
            "transferBorrowValidLifting",
            Some(C::ResourceTransferBorrow),
            K::Call,
        ),
        ResourceTransferOwn => ("transferOwn", Some(C::ResourceTransferOwn), K::Call),
        CurResourceBorrows => (
            "initializeCurrentBorrows",
            Some(C::CurrentBorrows),
            K::LiveReference {
                expression: "_jcoCurrentBorrowContext.borrows",
            },
        ),
        ResourceDestructorCall => ("callDestructor", Some(C::ResourceDestructor), K::Call),
    };
    RuntimeImport {
        suffix: "intrinsics/resource",
        export,
        context,
        kind,
    }
}

pub(crate) fn resource_owner_import(intrinsic: Intrinsic) -> RuntimeImport {
    let (export, context, kind) = match intrinsic {
        Intrinsic::HandleTables => (
            "initializeHandleTables",
            RuntimeContext::HandleTables,
            RuntimeImportKind::InitializedValue,
        ),
        Intrinsic::ScopeId => (
            "initializeScopeId",
            RuntimeContext::ScopeId,
            RuntimeImportKind::LiveReference {
                expression: "_jcoScopeIdContext.value",
            },
        ),
        _ => unreachable!(),
    };
    RuntimeImport {
        suffix: "intrinsics/resource",
        export,
        context: Some(context),
        kind,
    }
}
