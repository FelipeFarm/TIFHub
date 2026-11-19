"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/actions";
import { Logo } from "./Logo";

/** prefixes: other paths that should highlight this item (e.g. detail pages). */
type Item = { href: string; label: string; badge?: string; prefixes?: string[] };

export function Nav({
  items, cta, who, whoSub, tabbar,
}: {
  items: Item[];
  cta: { href: string; label: string };
  who: string;
  whoSub: string;
  tabbar?: boolean;
}) {
  const path = usePathname();
  const isOn = (i: Item) => path === i.href || !!i.prefixes?.some((p) => path.startsWith(p));
  return (
    <>
      <nav className="side" aria-label="Main">
        <Link href={items[0].href} className="logo">
          <Logo height={62} />
        </Link>
        <Link href={cta.href} className="cta">
          {cta.label}
        </Link>
        {items.map((i) => (
          <Link key={i.href} href={i.href} className={`nav ${isOn(i) ? "on" : ""}`}>
            {i.label}
            {i.badge && <span className="badge">{i.badge}</span>}
          </Link>
        ))}
        <div className="grow" />
        <div className="who">
          {who}
          <small>{whoSub}</small>
          <form action={logout}>
            <button className="linkbtn">Sign out</button>
          </form>
        </div>
      </nav>
      <Link href={items[0].href} className="mobile-brand" aria-label="Home">
        <Logo height={40} />
      </Link>
      {tabbar && (
        <nav className="tabbar" aria-label="Main">
          <Link href={items[0].href} className={isOn(items[0]) ? "on" : ""}>
            <i />
            {items[0].label}
          </Link>
          <Link href={cta.href} className={`plus ${path === cta.href ? "on" : ""}`}>
            <i>+</i>Ask us
          </Link>
          <Link href={items[1].href} className={isOn(items[1]) ? "on" : ""}>
            <i />
            {items[1].label}
          </Link>
        </nav>
      )}
    </>
  );
}
