use std::fs::{read_dir, read_to_string, write};

use anyhow::Result;

use webidl2wit::{webidl_to_wit, ConversionOptions, HandleUnsupported};
use wit_encoder::PackageName;

const IDL_VERSION_MAJOR: u64 = 0;
const IDL_VERSION_MINOR: u64 = 0;
const IDL_VERSION_PATCH: u64 = 1;

pub(crate) fn run() -> Result<()> {
    for file in read_dir("test/fixtures/idl")? {
        let file = file?;
        let file_name = file.file_name();
        let file_name_str = file_name.to_string_lossy().to_string();
        let Some(name) = file_name_str.strip_suffix(".webidl") else {
            continue;
        };
        let name = name.to_string();
        let interface_name = name.to_string();
        let idl_source = read_to_string(file.path())?;
        let idl = weedle::parse(&idl_source).unwrap();
        let wit = webidl_to_wit(
            idl,
            ConversionOptions {
                package_name: PackageName::new(
                    "idl",
                    name.clone(),
                    Some(semver::Version {
                        major: IDL_VERSION_MAJOR,
                        minor: IDL_VERSION_MINOR,
                        patch: IDL_VERSION_PATCH,
                        pre: semver::Prerelease::default(),
                        build: semver::BuildMetadata::default(),
                    }),
                ),
                interface: interface_name.clone(),
                unsupported_features: HandleUnsupported::Bail,
            },
        )?;

        let wit_str = wit.to_string();

        let output_file = format!("test/fixtures/idl/{name}.wit");
        write(
            &output_file,
            format!(
                "
                {}
                world window-test {{
                    include window;
                    export test: func();
                }}
            ",
                wit_str.replace("f64(", "%f64(").replace("-%", "-") // .replace("window-proxy", "window")
            ),
        )
        .unwrap();

        println!("Generated {output_file}");
    }

    Ok(())
}
