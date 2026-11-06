//! Named resource operations, storage owners, and remaining inline capabilities.
use super::{RuntimeContextIntrinsic, RuntimeImport, RuntimeImportKind};
use crate::intrinsics::Intrinsic;

pub(crate) fn resource_import(
    intrinsic: crate::intrinsics::resource::ResourceIntrinsic,
) -> RuntimeImport {
    use crate::intrinsics::resource::ResourceIntrinsic::*;
    let (export, context, kind) = match intrinsic {
        ResourceTableFlag => ("tableFlag", None, RuntimeImportKind::Value),
        ResourceTableOwnFlag => ("tableOwn", None, RuntimeImportKind::Value),
        HandleIndexSpaces => (
            "initializeHandleIndexSpaces",
            Some(RuntimeContextIntrinsic::InitializeHandleIndexSpaces),
            RuntimeImportKind::InitializedValue,
        ),
        GetHandleIndexSpace => (
            "getHandleIndexSpace",
            Some(RuntimeContextIntrinsic::InitializeHandleIndexSpaces),
            RuntimeImportKind::Call,
        ),
        ResourceTableCreateBorrow => (
            "tableCreateBorrow",
            Some(RuntimeContextIntrinsic::InitializeHandleIndexSpaces),
            RuntimeImportKind::Call,
        ),
        ResourceTableCreateOwn => (
            "tableCreateOwn",
            Some(RuntimeContextIntrinsic::InitializeHandleIndexSpaces),
            RuntimeImportKind::Call,
        ),
        ResourceTableGet => (
            "tableGet",
            Some(RuntimeContextIntrinsic::ResourceTableGet),
            RuntimeImportKind::Call,
        ),
        ResourceTableEnsureBorrowDrop => ("tableEnsureBorrowDrop", None, RuntimeImportKind::Call),
        ResourceTableRemove => (
            "tableRemove",
            Some(RuntimeContextIntrinsic::ResourceTableRemove),
            RuntimeImportKind::Call,
        ),
        ResourceCallBorrows => (
            "initializeCallBorrows",
            Some(RuntimeContextIntrinsic::InitializeCallBorrows),
            RuntimeImportKind::LiveReference {
                expression: "_jcoCallBorrowContext.borrows",
            },
        ),
        ResourceScopeCounter => (
            "initializeResourceScopeCounter",
            Some(RuntimeContextIntrinsic::InitializeResourceScopeCounter),
            RuntimeImportKind::LiveReference {
                expression: "_jcoResourceScopeCounterContext.value",
            },
        ),
        ResourceScopeTasks => (
            "initializeResourceScopeTasks",
            Some(RuntimeContextIntrinsic::InitializeResourceScopeTasks),
            RuntimeImportKind::InitializedValue,
        ),
        ResourceTransferBorrow => (
            "transferBorrow",
            Some(RuntimeContextIntrinsic::ResourceTransferBorrow),
            RuntimeImportKind::Call,
        ),
        ResourceTransferBorrowValidLifting => (
            "transferBorrowValidLifting",
            Some(RuntimeContextIntrinsic::ResourceTransferBorrow),
            RuntimeImportKind::Call,
        ),
        ResourceTransferOwn => (
            "transferOwn",
            Some(RuntimeContextIntrinsic::ResourceTransferOwn),
            RuntimeImportKind::Call,
        ),
        CurResourceBorrows => (
            "initializeCurrentBorrows",
            Some(RuntimeContextIntrinsic::InitializeCurrentBorrows),
            RuntimeImportKind::LiveReference {
                expression: "_jcoCurrentBorrowContext.borrows",
            },
        ),
        ResourceDestructorCall => (
            "callDestructor",
            Some(RuntimeContextIntrinsic::ResourceDestructorCall),
            RuntimeImportKind::Call,
        ),
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
            RuntimeContextIntrinsic::InitializeHandleTables,
            RuntimeImportKind::InitializedValue,
        ),
        Intrinsic::ScopeId => (
            "initializeScopeId",
            RuntimeContextIntrinsic::InitializeScopeId,
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

/// Capabilities which still live in generated code are looked up only when used.
pub(crate) fn discover_inline_dependencies(
    intrinsic: Intrinsic,
    args: &crate::intrinsics::RenderIntrinsicsArgs<'_>,
) {
    use crate::intrinsics::{p3::async_task::AsyncTaskIntrinsic, resource::ResourceIntrinsic};
    match intrinsic {
        Intrinsic::Resource(
            ResourceIntrinsic::ResourceTransferBorrow
            | ResourceIntrinsic::ResourceTransferBorrowValidLifting,
        ) => {
            args.require_intrinsic(Intrinsic::AsyncTask(AsyncTaskIntrinsic::GetCurrentTask));
        }
        Intrinsic::Resource(ResourceIntrinsic::ResourceDestructorCall) => {
            args.require_intrinsic(Intrinsic::AsyncTask(
                AsyncTaskIntrinsic::CreateNewCurrentImplicitThread,
            ));
        }
        _ => {}
    }
}
