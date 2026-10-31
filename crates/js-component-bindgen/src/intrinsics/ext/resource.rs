//! Named resource operations, storage owners, and remaining inline capabilities.
use super::{RuntimeContext, RuntimeImport, RuntimeImportKind};
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
            Some(RuntimeContext::HandleIndexSpaces),
            RuntimeImportKind::InitializedValue,
        ),
        GetHandleIndexSpace => (
            "getHandleIndexSpace",
            Some(RuntimeContext::HandleIndexSpaces),
            RuntimeImportKind::Call,
        ),
        ResourceTableCreateBorrow => (
            "tableCreateBorrow",
            Some(RuntimeContext::HandleIndexSpaces),
            RuntimeImportKind::Call,
        ),
        ResourceTableCreateOwn => (
            "tableCreateOwn",
            Some(RuntimeContext::HandleIndexSpaces),
            RuntimeImportKind::Call,
        ),
        ResourceTableGet => (
            "tableGet",
            Some(RuntimeContext::ResourceTableGet),
            RuntimeImportKind::Call,
        ),
        ResourceTableEnsureBorrowDrop => ("tableEnsureBorrowDrop", None, RuntimeImportKind::Call),
        ResourceTableRemove => (
            "tableRemove",
            Some(RuntimeContext::ResourceRemove),
            RuntimeImportKind::Call,
        ),
        ResourceCallBorrows => (
            "initializeCallBorrows",
            Some(RuntimeContext::CallBorrows),
            RuntimeImportKind::LiveReference {
                expression: "_jcoCallBorrowContext.borrows",
            },
        ),
        ResourceScopeCounter => (
            "initializeResourceScopeCounter",
            Some(RuntimeContext::ResourceScopeCounter),
            RuntimeImportKind::LiveReference {
                expression: "_jcoResourceScopeCounterContext.value",
            },
        ),
        ResourceScopeTasks => (
            "initializeResourceScopeTasks",
            Some(RuntimeContext::ResourceScopeTasks),
            RuntimeImportKind::InitializedValue,
        ),
        ResourceTransferBorrow => (
            "transferBorrow",
            Some(RuntimeContext::ResourceTransferBorrow),
            RuntimeImportKind::Call,
        ),
        ResourceTransferBorrowValidLifting => (
            "transferBorrowValidLifting",
            Some(RuntimeContext::ResourceTransferBorrow),
            RuntimeImportKind::Call,
        ),
        ResourceTransferOwn => (
            "transferOwn",
            Some(RuntimeContext::ResourceTransferOwn),
            RuntimeImportKind::Call,
        ),
        CurResourceBorrows => (
            "initializeCurrentBorrows",
            Some(RuntimeContext::CurrentBorrows),
            RuntimeImportKind::LiveReference {
                expression: "_jcoCurrentBorrowContext.borrows",
            },
        ),
        ResourceDestructorCall => (
            "callDestructor",
            Some(RuntimeContext::ResourceDestructor),
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
