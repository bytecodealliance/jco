#include "bindings/consumer_cpp.h"

#include <expected>
#include <iostream>
#include <tuple>
#include <utility>

::test::jco_bug::fs_provider::File&&
exports::test::jco_bug::fs_consumer::Transfer(
    ::test::jco_bug::fs_provider::File&& f) {
  return std::move(f);
}

std::tuple<::test::jco_bug::fs_provider::File&&,
           ::test::jco_bug::fs_provider::File&&>
exports::test::jco_bug::fs_consumer::TransferTwo(
    ::test::jco_bug::fs_provider::File&& a,
    ::test::jco_bug::fs_provider::File&& b) {
  return {std::move(a), std::move(b)};
}

std::tuple<::test::jco_bug::fs_provider::Group&&,
           ::test::jco_bug::fs_provider::File&&>
exports::test::jco_bug::fs_consumer::GroupRoundtrip(
    ::test::jco_bug::fs_provider::Group&& g,
    ::test::jco_bug::fs_provider::File&& seed) {
  return {std::move(g), std::move(seed)};
}

::test::jco_bug::fs_provider::File&&
exports::test::jco_bug::fs_consumer::CascadeOwn(
    ::test::jco_bug::fs_provider::File&& a,
    ::test::jco_bug::fs_provider::File&& /*b*/,
    ::test::jco_bug::fs_provider::File&& /*c*/,
    ::test::jco_bug::fs_provider::File&& /*d*/) {
  return std::move(a);
}

std::expected<void, wit::Void> exports::wasi::cli::run::Run() {
  using namespace ::test::jco_bug::fs_provider;

  auto a = OpenTemp();  // size=1
  auto b = OpenTemp();  // size=2
  auto g = MakeGroup(std::move(a), std::move(b));

  auto [sa, sb] = g.Sizes();

  if (sa != 1 || sb != 2) {
    return std::unexpected(wit::Void{});
  }

  return {};
}
