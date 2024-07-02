// NOTE: This expects to implement the 'imported' world of `feature-gates.wit`
export const foo = {
  // A should be present
  a() {
    println("OK");
  },

  // B should be present since 
  b() {
    println("OK");
  }

  // NOTE: c() should not be required/present at all

  // TODO: test interaction with features
};
