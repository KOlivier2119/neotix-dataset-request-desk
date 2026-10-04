import { ReactNode } from "react";

export default function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h} className="border-b border-zinc-200 px-2 py-1 text-left dark:border-zinc-800">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}
