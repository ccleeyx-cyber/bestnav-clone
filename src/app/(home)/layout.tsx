import { ShellProvider } from "@/components/shell/ShellProvider";

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return <ShellProvider>{children}</ShellProvider>;
}
