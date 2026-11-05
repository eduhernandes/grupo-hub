import { io } from "next/cache";

export default async function Footer() {
  await io();

  return (
    <footer className="mt-auto border-t border-gray-100 px-4 py-6 text-center text-sm text-gray-500">
      <p>
        © {new Date().getFullYear()} Prof. Eduardo Hernandes — Projetado para
        gestão acadêmica.
      </p>
      <a
        href="https://github.com/eduhernandes/grupo-hub/blob/main/LICENSE"
        className="mt-1 inline-block transition-colors hover:text-gray-700"
      >
        Código aberto disponível sob a Licença MIT
      </a>
    </footer>
  );
}
