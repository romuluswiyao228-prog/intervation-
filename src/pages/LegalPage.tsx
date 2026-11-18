// Page légale générique : structure vide en attendant la rédaction du contenu.
export default function LegalPage({ title }: { title: string }) {
  return (
    <article className="rounded-xl border border-gray-200 bg-white p-6">
      <h1 className="text-2xl font-bold text-teal-900">{title}</h1>
      <p className="mt-4 text-gray-500 italic">Contenu à rédiger.</p>
    </article>
  )
}
