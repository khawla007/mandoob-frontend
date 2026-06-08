type Params = { slug: string };

export default async function LegalPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  return (
    <section className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="text-3xl font-semibold capitalize">{slug.replace(/-/g, ' ')}</h1>
      <p className="mt-4 text-zinc-600">Legal document placeholder.</p>
    </section>
  );
}
