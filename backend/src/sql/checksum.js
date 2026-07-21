function xorChecksum(currentHex, nextHex) {
  const current = Buffer.from(currentHex || '0'.repeat(64), 'hex');
  const next = Buffer.from(nextHex, 'hex');
  if (current.length !== 32 || next.length !== 32) throw new Error('Invalid SQL mirror checksum');
  const result = Buffer.alloc(32);
  for (let index = 0; index < 32; index += 1) result[index] = current[index] ^ next[index];
  return result.toString('hex');
}

module.exports = {
  xorChecksum,
};
