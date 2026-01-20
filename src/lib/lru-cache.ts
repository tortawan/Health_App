type LruCacheOptions = {
  maxSize: number;
};

export class LruCache<K, V> {
  private readonly maxSize: number;
  private readonly cache = new Map<K, V>();

  constructor(options: LruCacheOptions) {
    this.maxSize = Math.max(1, options.maxSize);
  }

  get(key: K): V | undefined {
    if (!this.cache.has(key)) return undefined;
    const value = this.cache.get(key) as V;
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key: K, value: V) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    this.cache.set(key, value);
    if (this.cache.size > this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
  }

  size() {
    return this.cache.size;
  }
}
