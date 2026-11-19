/** Textos legais da plataforma DC-SIMU (português europeu). */

export type LegalDocId = 'privacidade' | 'termos' | 'cookies' | 'licencas'

export type LegalSection = { title: string; body: string[] }

export type LegalDoc = {
  id: LegalDocId
  title: string
  updated: string
  summary: string
  sections: LegalSection[]
}

const UPDATED = '19 de novembro de 2026'

export const LEGAL_DOCS: Record<LegalDocId, LegalDoc> = {
  privacidade: {
    id: 'privacidade',
    title: 'Política de privacidade',
    updated: UPDATED,
    summary:
      'Como o DC-SIMU trata dados pessoais quando utiliza a plataforma no navegador, cria conta ou trabalha em projetos.',
    sections: [
      {
        title: '1. Responsável pelo tratamento',
        body: [
          'O responsável pelo tratamento dos dados pessoais no âmbito desta plataforma é o operador do serviço DC-SIMU («nós»).',
          'Para exercer os seus direitos ou colocar questões sobre privacidade, utilize o contacto disponível na área de conta ou o canal de suporte indicado na aplicação.',
        ],
      },
      {
        title: '2. Dados que tratamos',
        body: [
          'Dados de conta: nome, endereço de e-mail, palavra-passe (armazenada de forma segura/hash), função ou instituição (se indicar) e plano de subscrição.',
          'Dados de utilização: projetos elétricos que cria ou edita, preferências de interface, registos técnicos necessários ao funcionamento (por exemplo diagnóstico de erros da aplicação).',
          'Dados de comunicação: mensagens de convite entre utilizadores, comentários em projetos (quando disponíveis no seu plano) e pedidos de alteração de plano.',
          'Não solicitamos dados sensíveis nos termos do RGPD. Os projetos podem conter informação técnica industrial; o conteúdo é da responsabilidade do utilizador que o introduz.',
        ],
      },
      {
        title: '3. Finalidades e bases legais',
        body: [
          'Prestação do serviço (execução do contrato): autenticação, gravação e partilha de projetos, simulação e funcionalidades do plano contratado.',
          'Interesse legítimo: segurança da plataforma, prevenção de abuso, melhoria da estabilidade e suporte técnico.',
          'Obrigação legal: faturação e obrigações contabilísticas quando aplicável a planos pagos.',
          'Consentimento: armazenamento não essencial de preferências quando o banner de cookies o solicitar (ver Política de cookies).',
        ],
      },
      {
        title: '4. Onde os dados são guardados',
        body: [
          'Consoante a configuração da instância, os dados podem residir no navegador (armazenamento local / IndexedDB) e/ou em serviços de backend (por exemplo base de dados e autenticação na nuvem).',
          'Em modo exclusivamente local, os projetos permanecem no seu dispositivo até que escolha exportar, partilhar ou ligar uma conta cloud.',
          'Quando utiliza backend cloud, os dados são alojados junto dos fornecedores contratados para alojamento e autenticação, com acesso restrito ao necessário para prestar o serviço.',
        ],
      },
      {
        title: '5. Partilha com terceiros',
        body: [
          'Não vendemos os seus dados pessoais.',
          'Podemos recorrer a subprocessadores de alojamento, autenticação, e-mail transacional ou faturação, vinculados contratualmente e limitados às finalidades do serviço.',
          'Projetos partilhados ficam acessíveis aos editores que convidar. É responsável por convidar apenas pessoas autorizadas.',
        ],
      },
      {
        title: '6. Prazos de conservação',
        body: [
          'Dados de conta e projetos: enquanto a conta estiver ativa e, após pedido de eliminação, pelo tempo necessário para concluir a eliminação e cumprir obrigações legais.',
          'Registos técnicos de segurança: pelo período mínimo necessário à deteção de abuso e estabilidade do serviço.',
          'Pode solicitar a eliminação da conta e dos projetos associados através dos meios de contacto da plataforma, salvo obrigações legais de conservação.',
        ],
      },
      {
        title: '7. Os seus direitos (RGPD)',
        body: [
          'Tem direito de acesso, retificação, apagamento, limitação, portabilidade e oposição, nos termos do Regulamento (UE) 2016/679 e da legislação nacional aplicável.',
          'Também pode apresentar reclamação à autoridade de controlo competente (em Portugal, a Comissão Nacional de Proteção de Dados — CNPD).',
          'Para exercer direitos, contacte-nos pelos canais da aplicação; poderemos pedir confirmação de identidade para proteger a conta.',
        ],
      },
      {
        title: '8. Segurança',
        body: [
          'Aplicamos medidas técnicas e organizativas adequadas: comunicação cifrada (HTTPS), controlo de sessões, separação de projetos por conta e práticas de desenvolvimento orientadas à minimização de dados.',
          'Nenhum sistema é 100 % inviolável; se tomar conhecimento de um incidente que afete os seus dados, será informado quando a lei o exigir.',
        ],
      },
      {
        title: '9. Menores',
        body: [
          'O serviço destina-se a utilização profissional e formativa. Se for menor, só deve utilizar a plataforma com autorização e supervisão de quem exerça as responsabilidades parentais, nos termos da lei aplicável.',
        ],
      },
      {
        title: '10. Alterações',
        body: [
          'Podemos atualizar esta política para refletir mudanças no serviço ou na lei. A data de atualização consta no topo da página. Alterações relevantes poderão ser comunicadas na aplicação.',
        ],
      },
    ],
  },

  termos: {
    id: 'termos',
    title: 'Termos de utilização',
    updated: UPDATED,
    summary:
      'Condições de uso do DC-SIMU: contas, projetos, planos, propriedade intelectual e limites de responsabilidade.',
    sections: [
      {
        title: '1. Objeto',
        body: [
          'O DC-SIMU é uma plataforma web para desenho, documentação e simulação didática de quadros e comandos elétricos (esquema, painel 3D, Ladder, GRAFCET e funcionalidades associadas).',
          'Ao criar conta ou utilizar o serviço, aceita estes Termos e a Política de privacidade.',
        ],
      },
      {
        title: '2. Conta e acesso',
        body: [
          'É responsável por manter a confidencialidade das credenciais e por toda a atividade realizada na sua conta.',
          'Deve fornecer informação verdadeira e atualizada. Podemos suspender contas em caso de uso abusivo, fraude ou violação destes Termos.',
        ],
      },
      {
        title: '3. Natureza do serviço (aviso importante)',
        body: [
          'O DC-SIMU é uma ferramenta de apoio ao projeto, formação e validação conceptual. Não substitui o projeto de execução assinado por técnico ou engenheiro competente, nem a verificação em obra.',
          'Modelos 3D, parâmetros elétricos e resultados de simulação são aproximações didáticas. Não garantem conformidade regulamentar, segurança funcional (SIL/PL) nem comportamento idêntico ao equipamento real em todas as condições.',
          'A decisão final sobre dimensionamento, proteção, cablagem e colocação em serviço é sempre do utilizador e dos responsáveis técnicos do projeto.',
        ],
      },
      {
        title: '4. Planos e pagamentos',
        body: [
          'Funcionalidades e limites dependem do plano (gratuito ou pago). A descrição comercial dos planos pode ser atualizada; alterações materiais em subscrições ativas serão comunicadas com a antecedência razoável.',
          'Valores, períodos de faturação e condições de renovação constam da área de conta / preços no momento da contratação.',
        ],
      },
      {
        title: '5. Conteúdos do utilizador',
        body: [
          'Mantém a titularidade sobre os projetos e ficheiros que cria. Concede-nos apenas a licença necessária para alojar, processar e apresentar esse conteúdo no âmbito do serviço (incluindo partilha com editores que convidar).',
          'Não deve carregar conteúdo ilícito, que viole direitos de terceiros ou que comprometa a segurança da plataforma.',
        ],
      },
      {
        title: '6. Propriedade intelectual da plataforma',
        body: [
          'O software, a interface, a documentação própria e a marca DC-SIMU são protegidos por direitos de propriedade intelectual.',
          'Modelos CAD e documentação de fabricantes mantêm os direitos dos respetivos titulares; o uso no DC-SIMU destina-se à representação e simulação no serviço, nos termos das licenças aplicáveis (ver Licenças).',
        ],
      },
      {
        title: '7. Uso aceitável',
        body: [
          'É proibido tentar aceder indevidamente a contas ou dados de terceiros, sobrecarregar deliberadamente o serviço, fazer engenharia inversa abusiva ou utilizar o DC-SIMU para fins ilícitos.',
          'A API e integrações, quando existirem, devem respeitar os limites técnicos e contratuais publicados.',
        ],
      },
      {
        title: '8. Limitação de responsabilidade',
        body: [
          'Na medida máxima permitida pela lei aplicável, o serviço é prestado «tal como está». Não nos responsabilizamos por decisões de projeto, danos indiretos, perda de dados no dispositivo do utilizador ou interrupções fora do nosso controlo razoável.',
          'Nada nestes Termos limita direitos imperativos do consumidor ou responsabilidade por dolo ou negligência grave, quando a lei não permita essa limitação.',
        ],
      },
      {
        title: '9. Rescisão',
        body: [
          'Pode deixar de utilizar o serviço e solicitar a eliminação da conta. Podemos encerrar ou suspender o acesso em caso de violação grave destes Termos.',
          'Após rescisão, o acesso aos projetos cloud cessa, sem prejuízo de exportações que tenha efetuado e de obrigações legais de conservação.',
        ],
      },
      {
        title: '10. Lei aplicável',
        body: [
          'Salvo norma imperativa em contrário, aplica-se a lei portuguesa. Os tribunais competentes serão os previstos na lei, sem prejuízo dos direitos de consumidores residentes noutro Estado-Membro da UE.',
        ],
      },
    ],
  },

  cookies: {
    id: 'cookies',
    title: 'Política de cookies',
    updated: UPDATED,
    summary:
      'Que informações o DC-SIMU guarda no seu navegador, para quê, e como gerir o consentimento.',
    sections: [
      {
        title: '1. O que são cookies e armazenamento local',
        body: [
          'Utilizamos sobretudo armazenamento local do navegador (localStorage / IndexedDB) e, quando aplicável, cookies técnicos necessários ao funcionamento.',
          'Estas tecnologias permitem manter a sessão, preferências e, em modo local, os seus projetos no dispositivo.',
        ],
      },
      {
        title: '2. Categorias',
        body: [
          'Estritamente necessários: autenticação, segurança, equilíbrio de carga, preferência de consentimento e funcionamento básico da aplicação. Não requerem consentimento para além do estritamente necessário ao serviço que pediu.',
          'Funcionais / preferências: por exemplo idioma de interface, estado da barra lateral ou capa local de projetos no dispositivo. São ativados após aceitar este aviso, quando não forem estritamente necessários.',
          'Não utilizamos, neste serviço, cookies de publicidade comportamental de terceiros.',
        ],
      },
      {
        title: '3. Exemplos no DC-SIMU',
        body: [
          'Sessão e conta: identificadores necessários para manter o login enquanto a sessão for válida.',
          'Projetos e rascunhos locais: conteúdo que grava no navegador quando trabalha offline ou em armazenamento local.',
          'Consentimento: registo da sua aceitação desta política (versão e data).',
          'Capas e preferências de interface: miniaturas e opções guardadas no dispositivo para melhorar a experiência.',
        ],
      },
      {
        title: '4. Gestão do consentimento',
        body: [
          'No primeiro acesso (ou quando a política muda de versão), apresentamos um aviso para confirmar que leu a informação sobre cookies e armazenamento local.',
          'Pode limpar dados do site nas definições do navegador; isso pode terminar a sessão e apagar projetos apenas locais.',
          'Para questões sobre privacidade, consulte também a Política de privacidade.',
        ],
      },
      {
        title: '5. Atualizações',
        body: [
          'Quando alterarmos de forma material esta política, pediremos nova confirmação através do aviso na aplicação.',
        ],
      },
    ],
  },

  licencas: {
    id: 'licencas',
    title: 'Licenças e créditos',
    updated: UPDATED,
    summary:
      'Software de terceiros, modelos e recursos utilizados no DC-SIMU.',
    sections: [
      {
        title: '1. Software da plataforma',
        body: [
          'O código da aplicação DC-SIMU e a sua interface estão protegidos por direitos de autor. O uso é concedido nos termos do seu plano e dos Termos de utilização — não implica cessão do código-fonte, salvo licença escrita em contrário.',
        ],
      },
      {
        title: '2. Bibliotecas de código aberto',
        body: [
          'A aplicação incorpora bibliotecas de código aberto (por exemplo React, Three.js e outras dependências listadas no manifesto do projeto). Cada biblioteca mantém a sua própria licença (MIT, Apache-2.0, BSD, entre outras).',
          'Os textos completos das licenças das dependências encontram-se nos repositórios e pacotes respetivos; mediante pedido razoável, podemos ajudar a identificar uma dependência concreta.',
        ],
      },
      {
        title: '3. Modelos CAD e documentação de fabricantes',
        body: [
          'Alguns equipamentos são representados com modelos ou dimensões inspirados em produtos reais (por exemplo Schneider Electric, Siemens, WEG, Phoenix Contact, SEW-EURODRIVE, entre outros).',
          'Marcas, nomes comerciais e documentação oficial pertencem aos respetivos titulares. O DC-SIMU não é afiliado nem endossado por esses fabricantes, salvo indicação expressa.',
          'As representações 3D e as fichas incluídas destinam-se a uso didático e de projeto no serviço; não substituem catálogos oficiais nem autorizam fabrico de peças.',
        ],
      },
      {
        title: '4. Texturas e meios',
        body: [
          'Determinadas texturas da biblioteca de materiais são utilizadas sob licenças permissivas (por exemplo CC0). Quando uma textura ou meio exigir atribuição, esta é indicada junto do recurso ou na documentação interna do projeto.',
        ],
      },
      {
        title: '5. Conteúdos que o utilizador carrega',
        body: [
          'É responsável por garantir que tem direitos sobre ficheiros, imagens ou modelos que importe para a plataforma, e que o seu uso não viola direitos de terceiros.',
        ],
      },
    ],
  },
}

export const LEGAL_NAV: { id: LegalDocId; path: string; label: string }[] = [
  { id: 'privacidade', path: '/privacidade', label: 'Privacidade' },
  { id: 'termos', path: '/termos', label: 'Termos' },
  { id: 'cookies', path: '/cookies', label: 'Cookies' },
  { id: 'licencas', path: '/licencas', label: 'Licenças' },
]

export function legalDocFromPath(pathname: string): LegalDocId | null {
  const clean = pathname.replace(/\/+$/, '') || '/'
  const hit = LEGAL_NAV.find((item) => item.path === clean)
  return hit?.id ?? null
}
