#include "bindings/fs_provider_consumer_cpp.h"

#include <expected>
#include <iostream>
#include <utility>

std::expected<void, wit::Void> exports::wasi::cli::run::Run() {
  using namespace ::test::jco_bug::fs_provider;
  auto a = MakeFile(1);
  auto b = MakeFile(2);
  auto g = MakeGroup(std::move(a), std::move(b));
  auto x = g.TakeA();
  (void)x;
  return {};
}
