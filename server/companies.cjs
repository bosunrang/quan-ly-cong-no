const companies = Object.freeze([
  { id: 'nam-hung-viet', name: 'Nam Hưng Việt', port: 3300,
    legalName: 'CÔNG TY CỔ PHẦN VẮC XIN VÀ SINH PHẨM NAM HƯNG VIỆT' },
  { id: 'tuong-khue', name: 'Tường Khuê', port: 3300 },
  { id: 'winbio', name: 'Winbio', port: 3300 },
  { id: 'naviva-group', name: 'Naviva Group', port: 3301 },
].map(Object.freeze));

function getCompany(id) {
  const company = companies.find((entry) => entry.id === id);
  if (!company) throw new Error('Mã công ty không hợp lệ.');
  return company;
}

const sharedHostCompanies = Object.freeze([
  getCompany('nam-hung-viet'),
  getCompany('naviva-group'),
]);

function companySettings(company) {
  return {
    companyName: company.legalName ?? company.name,
    companyAddress: '',
    displayName: company.name,
    tagline: 'Quản lý công nợ',
    logoDataUrl: null,
  };
}

module.exports = { companies, getCompany, sharedHostCompanies, companySettings };
