/** The Idea Farm logo (public/idea-farm-logo.webp, 2000×837). */
export function Logo({ height = 56 }: { height?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/idea-farm-logo.webp`}
      alt="The Idea Farm by VM Digital"
      className="brand"
      height={height}
      width={Math.round((height * 2000) / 837)}
    />
  );
}
