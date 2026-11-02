fn main() {
    let args = std::env::args().collect::<Vec<_>>();
    println!("hello {args:?}");
}
