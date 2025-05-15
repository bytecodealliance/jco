use std::{
    collections::HashSet,
    fs::{read_dir, read_to_string, write},
};

use anyhow::Result;

use webidl2wit::{webidl_to_wit, ConversionOptions, HandleUnsupported};

const IDL_VERSION_MAJOR: u64 = 0;
const IDL_VERSION_MINOR: u64 = 0;
const IDL_VERSION_PATCH: u64 = 1;

pub(crate) fn run() -> Result<()> {
    for file in read_dir("packages/jco/test/fixtures/idl")? {
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
        let mut global_singletons = HashSet::new();
        global_singletons.insert("Window".to_string());
        let wit = webidl_to_wit(
            idl,
            ConversionOptions {
                package_name: webidl2wit::PackageName::new(
                    "webidl",
                    name.to_string(),
                    Some(semver::Version {
                        major: IDL_VERSION_MAJOR,
                        minor: IDL_VERSION_MINOR,
                        patch: IDL_VERSION_PATCH,
                        pre: semver::Prerelease::default(),
                        build: semver::BuildMetadata::default(),
                    }),
                ),
                interface_name: if interface_name == "console" {
                    format!("global-{interface_name}")
                } else {
                    interface_name.clone()
                },
                unsupported_features: HandleUnsupported::Bail,
                singleton_interface: if interface_name == "console" {
                    Some(interface_name.clone())
                } else {
                    None
                },
                global_singletons,
                ..Default::default()
            },
        )?;

        let wit_str = wit.to_string();

        let world_definition = if interface_name == "console" {
            format!(
                "world {interface_name}-test {{
                    import global-{interface_name};
                    export test: func();
                }}"
            )
        } else {
            "world window-test {
                include window;
                export test: func();
            }"
            .to_string()
        };

        let output_file = format!("packages/jco/test/fixtures/idl/{name}.wit");
        write(
            &output_file,
            format!(
                "
                {wit_str}
                {world_definition}
            "
            ),
        )
        .unwrap();

        println!("Generated {output_file}");
    }

    Ok(())
}
