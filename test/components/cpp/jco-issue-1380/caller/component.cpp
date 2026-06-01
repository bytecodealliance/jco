#include "bindings/consumer_cpp.h"

#include <expected>
#include <iostream>

std::expected<void, wit::Void> exports::wasi::cli::run::Run() {
  auto h = ::test::jco_bug::iface::OpenTemp();
  h.Append("|x|");
  return {};
}
