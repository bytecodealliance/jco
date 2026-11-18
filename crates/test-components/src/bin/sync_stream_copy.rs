mod bindings {
    use super::Component;
    wit_bindgen::generate!({ world: "sync-stream-copy", skip: ["payloads"] });
    export!(Component);
}
struct Component;
#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "$root")]
unsafe extern "C" {
    #[link_name = "[stream-new-0]payloads"]
    fn stream_new() -> u64;
    #[link_name = "[async-lower][stream-read-0]payloads"]
    fn read_async(handle: u32, ptr: *mut u32, count: usize) -> u32;
    #[link_name = "[stream-write-0]payloads"]
    fn write_sync(handle: u32, ptr: *const u32, count: usize) -> u32;
    #[link_name = "[async-lower][stream-write-0]payloads"]
    fn write_async(handle: u32, ptr: *const u32, count: usize) -> u32;
    #[link_name = "[stream-drop-readable-0]payloads"]
    fn drop_readable(handle: u32);
    #[link_name = "[stream-drop-writable-0]payloads"]
    fn drop_writable(handle: u32);
    #[link_name = "[waitable-set-new]"]
    fn set_new() -> u32;
    #[link_name = "[waitable-join]"]
    fn join(handle: u32, set: u32);
    #[link_name = "[waitable-set-wait]"]
    fn wait(set: u32, event: *mut u32) -> u32;
    #[link_name = "[waitable-set-drop]"]
    fn set_drop(set: u32);
}
impl bindings::Guest for Component {
    fn run() -> Vec<u32> {
        #[cfg(target_arch = "wasm32")]
        unsafe {
            let pair = stream_new();
            let reader = pair as u32;
            let writer = (pair >> 32) as u32;
            let values = [42, 123];
            let mut received = vec![0; 2];
            assert_eq!(read_async(reader, received.as_mut_ptr(), 2), u32::MAX);
            assert_eq!(write_sync(writer, values.as_ptr(), 2), 32);
            // The completed read is delivered as an event; re-issuing the read
            // while the event is pending must trap per the Canonical ABI.
            let set = set_new();
            join(reader, set);
            let mut event = [0; 2];
            assert_eq!(wait(set, event.as_mut_ptr()), 2);
            assert_eq!(event, [reader, 32]);
            join(reader, 0);
            set_drop(set);
            drop_writable(writer);
            drop_readable(reader);
            received
        }
        #[cfg(not(target_arch = "wasm32"))]
        unreachable!()
    }

    fn reread_pending() -> u32 {
        #[cfg(target_arch = "wasm32")]
        unsafe {
            let pair = stream_new();
            let reader = pair as u32;
            let writer = (pair >> 32) as u32;
            let values = [42, 123];
            let mut received = [0; 2];
            assert_eq!(read_async(reader, received.as_mut_ptr(), 2), u32::MAX);
            assert_eq!(write_sync(writer, values.as_ptr(), 2), 32);
            // The read's completion event is still pending: this must trap.
            read_async(reader, received.as_mut_ptr(), 2)
        }
        #[cfg(not(target_arch = "wasm32"))]
        unreachable!()
    }

    async fn rewrite_pending() -> u32 {
        #[cfg(target_arch = "wasm32")]
        unsafe {
            let pair = stream_new();
            let reader = pair as u32;
            let writer = (pair >> 32) as u32;
            let values = [42, 123];
            let mut received = [0; 2];
            assert_eq!(write_async(writer, values.as_ptr(), 2), u32::MAX);
            assert_eq!(read_async(reader, received.as_mut_ptr(), 2), 32);
            // The write's completion event is still pending: this must trap.
            write_async(writer, values.as_ptr(), 2)
        }
        #[cfg(not(target_arch = "wasm32"))]
        unreachable!()
    }
}
fn main() {}
