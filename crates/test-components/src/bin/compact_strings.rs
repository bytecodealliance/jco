//! Raw string payloads exercise the compact ABI independently of Rust's UTF-8 strings.
mod bindings {
    use super::Component;
    wit_bindgen::generate!({ world: "compact-strings", skip: ["payloads"] });
    export!(Component);
}
use std::sync::Mutex;
use wit_bindgen::StreamReader;
struct Component;

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "$root")]
unsafe extern "C" {
    #[link_name = "[error-context-new-latin1+utf16]"]
    fn error_new(ptr: *const u16, len: u32) -> u32;
    #[link_name = "[error-context-debug-message-latin1+utf16]"]
    fn error_message(handle: u32, result: *mut u32);
    #[link_name = "[error-context-drop]"]
    fn error_drop(handle: u32);
    #[link_name = "[stream-new-0]payloads"]
    fn stream_new() -> u64;
    #[link_name = "[async-lower][stream-write-0]payloads"]
    fn stream_write(handle: u32, ptr: *const u32, count: usize) -> u32;
    #[link_name = "[async-lower][stream-read-0]payloads"]
    fn stream_read(handle: u32, ptr: *mut u32, count: usize) -> u32;
    #[link_name = "[stream-drop-writable-0]payloads"]
    fn stream_drop_writer(handle: u32);
    #[link_name = "[waitable-set-new]"]
    fn set_new() -> u32;
    #[link_name = "[waitable-join]"]
    fn join(handle: u32, set: u32);
    #[link_name = "[waitable-set-wait]"]
    fn wait(set: u32, event: *mut u32) -> u32;
    #[link_name = "[waitable-set-drop]"]
    fn set_drop(set: u32);
}

fn input(case_index: u32) -> (Vec<u16>, u32) {
    match case_index {
        0 => (vec![], 0),
        // Pack Latin-1 bytes into aligned storage, including the C1 controls.
        1 => (vec![0x8041, 0xe99f, 0x00ff], 5),
        2 => {
            let units: Vec<u16> = "\u{feff}A😀β".encode_utf16().collect();
            let len = units.len() as u32 | 0x80000000;
            (units, len)
        }
        3 => (vec![65, 233], 0x80000002),
        4 => (vec![0xd800], 0x80000001),
        _ => unreachable!(),
    }
}

unsafe fn take_string(pair: [u32; 2]) -> (String, bool) {
    let tagged = pair[1] & 0x80000000 != 0;
    let len = (pair[1] & 0x7fffffff) as usize;
    let ptr = pair[0] as *mut u8;
    let text = if len == 0 {
        String::new()
    } else if tagged {
        String::from_utf16(unsafe { std::slice::from_raw_parts(ptr.cast(), len) }).unwrap()
    } else {
        unsafe { std::slice::from_raw_parts(ptr, len) }
            .iter()
            .map(|b| char::from(*b))
            .collect()
    };
    if len != 0 {
        let layout =
            std::alloc::Layout::from_size_align(len * if tagged { 2 } else { 1 }, 2).unwrap();
        unsafe {
            std::alloc::dealloc(ptr, layout);
        }
    }
    (text, tagged)
}

struct Pending {
    writer: u32,
    _units: Vec<u16>,
    pair: Box<[u32; 2]>,
}
static PENDING: Mutex<Option<Pending>> = Mutex::new(None);

impl bindings::Guest for Component {
    fn error_message(case_index: u32) -> (String, bool) {
        #[cfg(target_arch = "wasm32")]
        unsafe {
            let (units, len) = input(case_index.min(4));
            let (ptr, len) = match case_index {
                5 => (0xffff_fffeusize as *const u16, 2),
                6 => (1usize as *const u16, 0),
                _ => (units.as_ptr(), len),
            };
            let handle = error_new(ptr, len);
            let mut result = [0; 2];
            error_message(handle, result.as_mut_ptr());
            error_drop(handle);
            take_string(result)
        }
        #[cfg(not(target_arch = "wasm32"))]
        unreachable!()
    }

    fn produce(case_index: u32) -> StreamReader<String> {
        #[cfg(target_arch = "wasm32")]
        unsafe {
            let (units, len) = input(case_index);
            let pair = Box::new([units.as_ptr() as u32, len]);
            let handles = stream_new();
            let writer = (handles >> 32) as u32;
            assert_eq!(stream_write(writer, pair.as_ptr(), 1), u32::MAX);
            let mut pending = PENDING.lock().unwrap();
            assert!(pending.is_none());
            *pending = Some(Pending {
                writer,
                _units: units,
                pair,
            });
            StreamReader::new(
                handles as u32,
                <String as bindings::wit_stream::StreamPayload>::VTABLE,
            )
        }
        #[cfg(not(target_arch = "wasm32"))]
        unreachable!()
    }

    fn finish() {
        #[cfg(target_arch = "wasm32")]
        unsafe {
            let pending = PENDING.lock().unwrap().take().unwrap();
            assert_eq!(stream_write(pending.writer, pending.pair.as_ptr(), 1), 16);
            stream_drop_writer(pending.writer);
        }
    }

    fn consume(values: StreamReader<String>) -> (String, bool) {
        #[cfg(target_arch = "wasm32")]
        unsafe {
            let mut pair = [0; 2];
            let result = stream_read(values.handle(), pair.as_mut_ptr(), 1);
            if result == u32::MAX {
                let set = set_new();
                join(values.handle(), set);
                let mut event = [0; 2];
                assert_eq!(wait(set, event.as_mut_ptr()), 2);
                assert_eq!(event, [values.handle(), 16]);
                join(values.handle(), 0);
                set_drop(set);
            } else {
                assert_eq!(result, 16);
            }
            take_string(pair)
        }
        #[cfg(not(target_arch = "wasm32"))]
        unreachable!()
    }
}
fn main() {}
