// ============================================================================
// MarcaBanco.jsx - Identificação visual do banco
// Projeto Banco - Ticket 37060 | Agiw Sistemas
//
// Exibe o código do banco (compensação) sobre a cor institucional. Substitui
// o logotipo enquanto os arquivos oficiais não estão disponíveis no projeto,
// mantendo o reconhecimento visual previsto no protótipo.
// ============================================================================

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
 */
export function MarcaBanco({ codBanco, corBanco = '#3b82f6', corTexto = '#ffffff', tamanho = 'md', nomBanco }) {
   return (
      <span
         className={`marca-banco ${TAMANHOS[tamanho] ?? TAMANHOS.md}`}
         style={{ background: corBanco, color: corTexto }}
         title={nomBanco ?? codBanco}
         aria-hidden="true"
      >
         {codBanco}
      </span>
   );
} // MarcaBanco
