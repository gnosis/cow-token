module.exports = {
  skipFiles: [
    // This folder contains contracts that are only used in tests.
    "test/",
    // This folder contains vendored contracts that were already tested in their
    // own repositoried.
    "vendored/",
  ],
};
