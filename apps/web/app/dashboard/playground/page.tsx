import { Playground } from "./_components";

export default function Page() {
  // Pin the playground to its slot in the dashboard layout. The layout
  // gives this slot a flex-bounded height; relative + flex-1 + min-h-0
  // turn that into a concrete box that the playground's inner absolute
  // children can fill. Other pages don't need this scaffold.
  return (
    <div className="relative flex min-h-0 flex-1">
      <Playground />
    </div>
  );
}
