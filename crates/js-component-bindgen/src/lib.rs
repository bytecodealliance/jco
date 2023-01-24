use anyhow::Result;
mod bindgen;
mod component;
mod files;
mod ns;
mod source;

pub use bindgen::GenerationOpts;

/// Calls [`write!`] with the passed arguments and unwraps the result.
///
/// Useful for writing to things with infallible `Write` implementations like
/// `Source` and `String`.
///
/// [`write!`]: std::write
#[macro_export]
macro_rules! uwrite {
    ($dst:expr, $($arg:tt)*) => {
        write!($dst, $($arg)*).unwrap()
    };
}

/// Calls [`writeln!`] with the passed arguments and unwraps the result.
///
/// Useful for writing to things with infallible `Write` implementations like
/// `Source` and `String`.
///
/// [`writeln!`]: std::writeln
#[macro_export]
macro_rules! uwriteln {
    ($dst:expr, $($arg:tt)*) => {
        writeln!($dst, $($arg)*).unwrap()
    };
}

pub struct Transpiled {
    pub files: Vec<(String, Vec<u8>)>,
    pub imports: Vec<String>,
    pub exports: Vec<String>,
}

/// Generate the JS transpilation bindgen for a given Wasm component binary
/// Outputs the file map and import and export metadata for the generation
pub fn transpile(component: Vec<u8>, opts: GenerationOpts) -> Result<Transpiled, anyhow::Error> {
    let name = opts.name.clone();
    let mut gen = opts.build()?;
    let mut files_obj = files::Files::default();
    let component::ComponentInfo { imports, exports } =
        component::generate(&mut gen, &name, &component, &mut files_obj)?;

    let mut files: Vec<(String, Vec<u8>)> = Vec::new();
    for (name, source) in files_obj.iter() {
        files.push((String::from(name), source.to_vec()));
    }
    Ok(Transpiled {
        files,
        imports,
        exports,
    })
}
