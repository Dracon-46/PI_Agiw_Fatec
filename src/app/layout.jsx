// app/layout.jsx - Projeto Banco - Ticket 37060
import '../styles/globals.css';
import { BankContextProvider } from '../contexts/BankContext.jsx';
import { NotificacoesProvider } from '../components/comum/Notificacoes.jsx';

export const metadata = {
  title: 'Conciliação Bancária | AGIW',
  description: 'Módulo de Conciliação Bancária - Agiw Sistemas',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <BankContextProvider>
          <NotificacoesProvider>{children}</NotificacoesProvider>
        </BankContextProvider>
      </body>
    </html>
  );
}
