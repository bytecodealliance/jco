use std::io::Write;

fn main() {
    let args = std::env::args().collect::<Vec<_>>();
    if let Some(mode) = args.get(1).filter(|mode| mode.starts_with("output-")) {
        let exits = mode.ends_with("exit");
        if mode.contains("large") {
            let payload = "x".repeat(64 * 1024);
            for index in 0..16 {
                writeln!(std::io::stdout(), "out {index}:{payload}").unwrap();
                writeln!(std::io::stderr(), "err {index}:{payload}").unwrap();
            }
        } else {
            let label = if exits { "exit" } else { "return" };
            println!("out: {label}");
            eprintln!("err: {label}");
        }
        if exits {
            std::process::exit(3);
        }
        return;
    }
    println!("hello {args:?}");
}
