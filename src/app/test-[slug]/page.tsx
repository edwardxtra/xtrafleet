export default function TestPage({ params }: { params: { slug: string } }) {
  return <div>TEST WORKS! Slug: {params.slug}</div>;
}
