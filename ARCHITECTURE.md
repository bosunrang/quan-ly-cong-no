# Kiến trúc Quản lý công nợ

Ứng dụng quản lý công nợ phải thu của khách hàng từ Sổ chi tiết bán hàng MISA: nhập sổ bán hàng,
ghi và phân bổ khoản thu, theo dõi công nợ, lập biên bản đối chiếu. React + TypeScript + Vite trong
vỏ Electron, có máy chủ LAN cho nhiều máy dùng chung. Mã tổ chức theo module nghiệp vụ; component
giao diện không tự đọc/ghi dữ liệu.

## Cấu trúc chuẩn

```text
src/
  app/                 Điều phối ứng dụng, cấu hình trang, điều hướng, đăng nhập
    layout/            Header, Sidebar và app shell
  domain/              Model và quy tắc nghiệp vụ, không phụ thuộc React/CSS
    access/            Tài khoản, mật khẩu, thẻ truy cập
    assignments/       Quy tắc giao, chuyển và kết thúc phụ trách
    customers/         Hồ sơ khách hàng, tỉnh/thành, repository
    employees/         Nhân viên kinh doanh, repository
    misa/              Sổ bán hàng MISA và cách gom thành chứng từ/công nợ
    payments/          Sổ khoản thu: phân bổ, đảo phiếu, công nợ theo hóa đơn
    settings/          Cài đặt, thông tin bên bán, sao lưu/khôi phục
  features/            Module màn hình độc lập
    dashboard/         Tổng quan công nợ
    misa/              Nhập và đối chiếu lại Sổ chi tiết bán hàng
    receivables/       Công nợ phải thu theo khách hàng và hóa đơn
    payments/          Ghi khoản thu và phân bổ vào hóa đơn
    reports/           Biên bản đối chiếu công nợ (in, Excel)
    customers/         Danh mục khách hàng, nhập Excel
    sales/             Nhân viên và phân công khách hàng
    accounts/          Người dùng và quyền
    activity/          Nhật ký sử dụng
    settings/          Thông tin doanh nghiệp, dữ liệu, sao lưu
  shared/
    hooks/             Hook dùng chung (phân trang, thông báo, lỗi lưu trữ)
    lib/               Ngày tháng, đọc Excel (Web Worker), tiện ích nhỏ
    storage/           Lớp lưu trữ: SQLite qua IPC, máy chủ LAN, trình duyệt, bộ đệm sổ
    ui/                Component dùng chung: Dialog, DateInput, StatusPill, Notice...
  styles/
    index.css          Điểm nhập CSS duy nhất, quy định thứ tự cascade
    foundation/        Font, token, reset/base và typography
    layout/            App shell và responsive toàn ứng dụng
    shared/            Style của component dùng chung
electron/              Vỏ desktop, SQLite (database.cjs), cầu nối IPC, chế độ máy chủ LAN
server/                Máy chủ LAN: phân quyền, đăng nhập, sao lưu tự động (chạy được không cần Electron)
tests/                 Vitest cho src; node --test cho SQLite và máy chủ LAN
```

## Quy tắc bắt buộc

1. Màu, cỡ chữ và kích thước shell lấy từ `styles/foundation/tokens.css`; không viết mã màu riêng trong component mới.
2. Model, repository và quy tắc nghiệp vụ nằm trong `domain`; UI và state màn hình nằm trong `features`.
3. UI chỉ nhận dữ liệu và callback qua props hoặc hook của feature; không gọi trực tiếp `localStorage`, SQLite hay API.
4. Mọi phép tính tiền (công nợ, phân bổ, số dư đối chiếu) nằm trong `domain` và có kiểm thử; dashboard, báo cáo và màn hình thu tiền dùng chung, không tự tính lại.
5. Dữ liệu MISA được đọc qua adapter kiểm tra tiêu đề và định dạng số trước khi vào model chuẩn; nhập lại theo từng chứng từ, người dùng xem trước rồi mới ghi.
6. Chứng từ đã có khoản thu phân bổ không bị thay hay gỡ khi nhập lại sổ.
7. Ghi sổ bán hàng và sổ khoản thu dùng kiểm tra phiên bản (`importedAt`, `revision`) để không ghi đè thay đổi của máy khác.
8. Ẩn menu không phải là phân quyền: máy chủ LAN kiểm tra thẻ truy cập và cấu trúc dữ liệu trước khi đọc/ghi.
9. CSS riêng của feature đặt cạnh feature đó; CSS nền chỉ import qua `styles/index.css`.
10. Feature không import model, logic hoặc CSS của feature khác. Phần dùng chung chuyển vào `domain` hoặc `shared`.
11. Page chỉ điều phối state và use case; khối giao diện có trách nhiệm riêng tách vào `components`.
12. Khóa lưu trữ (`cong-no.*`) và migration thuộc repository/`electron/database.cjs`. Không đổi khóa khi refactor; nếu bắt buộc phải đổi thì làm bằng bước migration (như v12).
13. Schema SQLite đổi bằng bước migration mới, chạy trong transaction; không sửa bước đã chạy. App tạo bản sao tệp trước mỗi lần nâng cấp.
14. Trạng thái dạng nhãn dùng `shared/ui/StatusPill` với đúng năm ngữ nghĩa: `success`, `warning`, `info`, `neutral`, `danger`.

## Hướng phụ thuộc

```text
app ──> features ──> domain
 │          │           │
 └────────> shared <────┘

domain  -X-> features
feature -X-> feature khác
shared  -X-> features/domain nghiệp vụ
```

`domain` phải chạy được không cần React. `shared/ui` chỉ chứa giao diện tổng quát.

## Luồng dữ liệu

```text
Excel MISA ─> Web Worker đọc ô ─> adapter kiểm tra ─> xem trước theo chứng từ ─> Sổ bán hàng
                                                                                     │
Khoản thu ─> phân bổ vào hóa đơn ─> Sổ khoản thu ─────────────────────────────────────┤
                                                                                     v
                                     Công nợ phải thu · Dashboard · Biên bản đối chiếu
```

Có ba nơi lưu dữ liệu, chọn tự động trong `shared/storage`:

- **Desktop:** SQLite trong Electron qua preload/IPC. Sổ bán hàng và sổ khoản thu đọc/ghi bất đồng bộ.
- **Máy chủ LAN:** máy trạm gọi `server/lan.cjs` qua HTTP; mỗi công ty một tệp SQLite.
- **Trình duyệt:** `localStorage`/IndexedDB, chỉ dùng khi phát triển giao diện.

Sổ bán hàng và sổ khoản thu được giữ trong bộ đệm dùng chung (`datasetCache`); máy trạm chỉ tải lại
khi dấu thay đổi của sổ khác bản đang giữ. Hướng chuyển sang một đường dữ liệu duy nhất qua máy chủ
(như app cước phí) nằm trong [docs/KE-HOACH-CHUYEN-KIEN-TRUC.md](docs/KE-HOACH-CHUYEN-KIEN-TRUC.md).

## Lưu trữ và an toàn dữ liệu

- Dữ liệu ghi theo envelope `{ version, data }`; SQLite là nguồn duy nhất khi có, không dùng bản sao trên trình duyệt thay thế.
- Lỗi đọc dữ liệu báo lên toàn ứng dụng và không ghi đè gì. UI chỉ báo thành công sau khi repository xác nhận đã ghi.
- Sao lưu tự động 14 bản theo ngày, và bản JSON trước mỗi thao tác xóa/khôi phục.
- Schema hiện tại: 12. Bước v12 bỏ các bảng của app chiết khấu cũ và đổi khóa `mkt-cost.*` sang `cong-no.*`.
  Bản sao lưu SQLite cũ được nâng cấp trên bản chép tạm khi đọc, tệp sao lưu gốc giữ nguyên.
