import type { KnowledgeBaseArticle, KnowledgeBaseCategory, KnowledgeBaseCategoryId } from './index';

export type KnowledgeBaseFilters = { query?: string; category?: string };

export function normalizeKnowledgeQuery(value: string): string {
  return normalizeSearchText(value).slice(0, 160);
}

export function filterKnowledgeBaseArticles(
  articles: readonly KnowledgeBaseArticle[],
  categories: readonly KnowledgeBaseCategory[],
  filters: KnowledgeBaseFilters,
): KnowledgeBaseArticle[] {
  const query = normalizeKnowledgeQuery(filters.query ?? '');
  const categoryLabels = new Map(categories.map((category) => [category.id, category.label]));
  return articles.filter((article) => {
    if (filters.category && article.category !== filters.category) return false;
    if (!query) return true;
    const searchable = normalizeSearchText(
      [
        article.title,
        article.description,
        ...article.keywords,
        categoryLabels.get(article.category) ?? article.category,
      ].join(' '),
    );
    return searchable.includes(query);
  });
}

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase('en').replace(/\s+/g, ' ');
}

export function buildKnowledgeBaseIndex(
  articles: readonly KnowledgeBaseArticle[],
  categories: readonly KnowledgeBaseCategory[],
) {
  const categoryCounts = new Map<KnowledgeBaseCategoryId, number>(
    categories.map((category) => [category.id, 0]),
  );
  for (const article of articles) {
    categoryCounts.set(article.category, (categoryCounts.get(article.category) ?? 0) + 1);
  }
  return {
    categoryCounts,
    featured: articles.slice(0, 4),
    primaryCategories: categories.slice(0, 6),
    additionalCategories: categories.slice(6),
  };
}
