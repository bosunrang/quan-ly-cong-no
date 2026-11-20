function updateConfig(url, publisher) {
  if (!url && !publisher) return undefined;
  let feed;
  try { feed = new URL(url); } catch {}
  if (!feed || feed.protocol !== 'https:' || feed.username || feed.password || feed.search || feed.hash ||
      typeof publisher !== 'string' || !publisher.trim() || /[\r\n]/.test(publisher)) {
    throw new Error('Cần CONG_NO_UPDATE_URL dạng HTTPS và CONG_NO_UPDATE_PUBLISHER khớp chứng thư ký Windows.');
  }
  if (!feed.pathname.endsWith('/')) feed.pathname += '/';
  return { url: feed.href, publisher: publisher.trim() };
}
module.exports = { updateConfig };
