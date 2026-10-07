// Metadados de categorias, tipos e cores usados em todas as telas.
export const EXPENSE_CATS = {
  'Moradia': { icon: 'ph ph-house', kind: 'fixo' },
  'Mercado': { icon: 'ph ph-shopping-cart', kind: 'variável' },
  'Delivery': { icon: 'ph ph-hamburger', kind: 'variável' },
  'Saúde': { icon: 'ph ph-heartbeat', kind: 'fixo + variável' },
  'Lazer': { icon: 'ph ph-popcorn', kind: 'variável' },
  'Assinaturas': { icon: 'ph ph-repeat', kind: 'fixo' },
  'Transporte': { icon: 'ph ph-car', kind: 'variável' },
  'Contas da casa': { icon: 'ph ph-lightning', kind: 'fixo' },
  'IPVA e seguro': { icon: 'ph ph-receipt', kind: 'parcelado' },
  'Compras': { icon: 'ph ph-bag', kind: 'variável' },
  'Educação': { icon: 'ph ph-graduation-cap', kind: 'fixo' },
  'Viagem': { icon: 'ph ph-airplane-tilt', kind: 'variável' },
  'Outros': { icon: 'ph ph-dots-three-circle', kind: 'variável' },
};
export const INCOME_CATS = {
  'Salário': { icon: 'ph ph-briefcase' },
  'Freelance': { icon: 'ph ph-laptop' },
  'Rendimentos': { icon: 'ph ph-coins' },
  'Outras receitas': { icon: 'ph ph-plus-circle' },
};
export const APORTE_CAT = 'Aporte em investimentos';
export const catIcon = c => EXPENSE_CATS[c]?.icon || INCOME_CATS[c]?.icon || (c === APORTE_CAT ? 'ph ph-chart-line-up' : 'ph ph-tag');

export const UP = 'oklch(0.84 0.16 160)';
export const DN = 'oklch(0.73 0.17 22)';
export const WARN = 'oklch(0.82 0.11 85)';

export const KIND_LABEL = { despesa: 'Despesa', receita: 'Receita', aporte: 'Aporte', fatura: 'Fatura', resgate: 'Resgate' };
export const GOAL_ICONS = ['ph ph-lifebuoy', 'ph ph-airplane-tilt', 'ph ph-car-profile', 'ph ph-sun-horizon', 'ph ph-house-line', 'ph ph-graduation-cap', 'ph ph-flag-pennant', 'ph ph-gift', 'ph ph-heart', 'ph ph-laptop'];
export const ACCOUNT_KINDS = { checking: 'Conta corrente', wallet: 'Carteira / dinheiro', broker: 'Corretora', savings: 'Poupança / reserva' };

export const INDEXERS = { CDI: '% do CDI', PRE: 'Pré-fixado (% a.a.)', IPCA: 'IPCA + (% a.a.)' };
