import { describe, it, expect } from 'vitest';
import { findCategory, findCategoryBySlug, allCategories } from './categories';

describe('categories', () => {
  describe('findCategory', () => {
    it('should find a category by name', () => {
      const category = findCategory('موبایل و تبلت');
      expect(category).toBeDefined();
      expect(category?.name).toBe('موبایل و تبلت');
      expect(category?.slug).toBe('mobile-tablet');
    });

    it('should return undefined for a non-existent category name', () => {
      const category = findCategory('non-existent-category');
      expect(category).toBeUndefined();
    });

    it('should return undefined for an empty string', () => {
      const category = findCategory('');
      expect(category).toBeUndefined();
    });
  });

  describe('findCategoryBySlug', () => {
    it('should find a category by slug', () => {
      const category = findCategoryBySlug('mobile-tablet');
      expect(category).toBeDefined();
      expect(category?.name).toBe('موبایل و تبلت');
      expect(category?.slug).toBe('mobile-tablet');
    });

    it('should return undefined for a non-existent category slug', () => {
      const category = findCategoryBySlug('non-existent-slug');
      expect(category).toBeUndefined();
    });

    it('should return undefined for an empty string slug', () => {
      const category = findCategoryBySlug('');
      expect(category).toBeUndefined();
    });
  });
});
