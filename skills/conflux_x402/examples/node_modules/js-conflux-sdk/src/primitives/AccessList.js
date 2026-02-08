const format = require('../util/format');

class AccessListEntry {
  constructor(address, storageKeys = []) {
    this.address = format.hexAddress(address);
    this.storageKeys = storageKeys.map(format.hex);
  }

  // encode to buffer for RLP encoding
  encode() {
    return [
      format.hexBuffer(this.address),
      this.storageKeys.map(val => format.hexBuffer(val)),
    ];
  }
}

class AccessList {
  /**
   *
   * @param {object[]|array[]} entries
   */
  constructor(entries = []) {
    // initiate AccessListEntry
    for (const i in entries) {
      if (Object.hasOwn(entries, i)) {
        const entry = entries[i];
        if (Array.isArray(entry)) {
          entries[i] = new AccessListEntry(entry[0], entry[1]);
        } else if (typeof entry === 'object') {
          entries[i] = new AccessListEntry(entry.address, entry.storageKeys);
        } else {
          throw new Error('Invalid AccessListEntry');
        }
      }
    }
    this.entries = entries;
  }

  encode() {
    return this.entries.map(entry => entry.encode());
  }
}

module.exports = {
  AccessListEntry,
  AccessList,
};
