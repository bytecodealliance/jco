///|
pub async fn greet(
  name : String,
  background_group : @async-core.TaskGroup[Unit],
) -> String {
  ignore(background_group)
  "hello, " + name
}

///|
pub async fn names(background_group : @async-core.TaskGroup[Unit]) -> Array[String] {
  ignore(background_group)
  ["alpha", "beta 🌍"]
}
