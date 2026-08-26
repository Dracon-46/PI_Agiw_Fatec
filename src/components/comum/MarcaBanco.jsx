'use client';
// ============================================================================
// MarcaBanco.jsx - Identificação visual do banco
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Item 6.1.1 do documento de visão: o cartão da conta exibe o logotipo do
// banco. No Satis a origem é "/pesqgen?nompesquisa=LOGO_BANCO"; aqui o caminho
// vem da coluna banco.url_logo e aponta para os arquivos em /public/bancos.
//
// Sem logotipo cadastrado — ou se o arquivo não carregar — cai no selo com o
// código de compensação sobre a cor institucional, que é sempre reconhecível.
// ============================================================================

import { useEffect, useState } from 'react';

/** Tamanhos aceitos, mapeados para as classes utilitárias do tema */
const TAMANHOS = {
   sm: 'marca-banco-sm',
   md: 'marca-banco-md',
   lg: 'marca-banco-lg',
};

/**
 * @param {object} oPropriedades
 * @param {string} oPropriedades.codBanco Código de compensação (ex.: "237")
 * @param {string} [oPropriedades.corBanco] Cor institucional de fundo
 * @param {string} [oPropriedades.corTexto] Cor do texto sobre o fundo
 * @param {'sm'|'md'|'lg'} [oPropriedades.tamanho] Dimensão do selo
 * @param {string} [oPropriedades.nomBanco] Nome usado no título acessível
 * @param {string} [oPropriedades.urlLogo] Caminho do logotipo do banco
 */
export function MarcaBanco({
   codBanco,
   corBanco = '#3b82f6',
   corTexto = '#ffffff',
   tamanho = 'md',
   nomBanco,
   urlLogo = '',
}) {
   const [bFalhou, setFalhou] = useState(false);
   const sClasse = `marca-banco ${TAMANHOS[tamanho] ?? TAMANHOS.md}`;
   const sTitulo = nomBanco ?? codBanco;

   // Trocar de banco precisa reabilitar a tentativa de carregar o logotipo
   useEffect(() => {
      setFalhou(false);
   }, [urlLogo]);

   if (urlLogo && !bFalhou) {
      return (
         // eslint-disable-next-line @next/next/no-img-element
         <img
            className={`${sClasse} marca-banco-logo`}
            src={urlLogo}
            alt={sTitulo}
            title={sTitulo}
            onError={() => setFalhou(true)}
         />
      );
   }

   return (
      <span
         className={sClasse}
         style={{ background: corBanco, color: corTexto }}
         title={sTitulo}
         aria-hidden="true"
      >
         {codBanco}
      </span>
   );
} // MarcaBanco
