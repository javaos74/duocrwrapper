function FindProxyForURL (url, host) {
  // our local URLs from the domains below example.com don't need a proxy:
  if (shExpMatch(host, '*.myrobots.co.kr')) {
    return 'PROXY 20.249.60.203:5000';
  }
  return 'DIRECT';
}
