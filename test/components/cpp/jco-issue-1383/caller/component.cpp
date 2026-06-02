#include "bindings/fs_provider_borrow_consumer_cpp.h"

#include <expected>
#include <iostream>

std::expected<void, wit::Void> exports::wasi::cli::run::Run() {
  using namespace ::test::jco_bug::fs_provider_borrow;

  auto f = OpenTemp();
  const auto size = BorrowOne(f);

  if (size != 1) {
    return std::unexpected(wit::Void{});
  }

  return {};
}
