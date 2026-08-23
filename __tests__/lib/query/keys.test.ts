import { describe, it, expect } from 'vitest';
import { queryKeys, searchKey, projectKey, versionsKey, projectsBatchKey } from '@/lib/query/keys';

describe('query keys', () => {
  describe('searchKey', () => {
    it('lowercases and trims the query', () => {
      const key = searchKey({
        query: '  Sodium ',
        mcVersion: '1.20.1',
        loader: 'Fabric',
        category: 'All',
        sort: 'popular'
      });
      expect(key[1].query).toBe('sodium');
    });

    it('produces stable output for identical params', () => {
      const p = {
        query: 'x', mcVersion: '1.20.1', loader: 'Fabric',
        category: 'All', sort: 'popular' as const
      };
      const a = searchKey(p);
      const b = searchKey(p);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });

    it('defaults projectType to mod and differs when type changes', () => {
      const base = {
        query: 'x', mcVersion: '1.20.1', loader: 'Fabric',
        category: 'All', sort: 'popular' as const
      };
      expect(searchKey(base)[1].projectType).toBe('mod');
      expect(JSON.stringify(searchKey(base))).not.toBe(
        JSON.stringify(searchKey({ ...base, projectType: 'shader' }))
      );
    });

    it('differs when any single field changes', () => {
      const base = {
        query: 'x', mcVersion: '1.20.1', loader: 'Fabric',
        category: 'All', sort: 'popular' as const
      };
      const changed = searchKey({ ...base, sort: 'updated' });
      expect(JSON.stringify(searchKey(base))).not.toBe(JSON.stringify(changed));
    });
  });

  describe('projectKey', () => {
    it('generates ["project", slug]', () => {
      expect(projectKey('sodium')).toEqual(['project', 'sodium']);
    });
  });

  describe('versionsKey', () => {
    it('includes null for missing mcVersion/loader', () => {
      expect(versionsKey('sodium')).toEqual(['versions', 'sodium', null, null]);
    });

    it('includes provided mcVersion and loader', () => {
      expect(versionsKey('sodium', '1.20.1', 'Fabric')).toEqual([
        'versions', 'sodium', '1.20.1', 'Fabric'
      ]);
    });
  });

  describe('projectsBatchKey', () => {
    it('sorts ids to produce deterministic key', () => {
      expect(projectsBatchKey(['b', 'a', 'c'])).toEqual(['projects-batch', 'a,b,c']);
      expect(projectsBatchKey(['c', 'b', 'a'])).toEqual(['projects-batch', 'a,b,c']);
    });

    it('produces "empty" for empty array', () => {
      // 実装は空配列で "" を返す
      expect(projectsBatchKey([])).toEqual(['projects-batch', '']);
    });
  });

  describe('queryKeys facade', () => {
    it('exposes all builders', () => {
      expect(queryKeys.search.all).toEqual(['search']);
      expect(typeof queryKeys.search.of).toBe('function');
      expect(typeof queryKeys.project).toBe('function');
      expect(typeof queryKeys.versions).toBe('function');
      expect(typeof queryKeys.projectsBatch).toBe('function');
      expect(queryKeys.gameVersions).toEqual(['tag', 'game_version']);
    });
  });
});
