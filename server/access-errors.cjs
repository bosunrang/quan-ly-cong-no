function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

module.exports = { fail };
