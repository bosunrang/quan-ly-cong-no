# Kiến trúc Quản lý công nợ

Ứng dụng quản lý công nợ phải thu của khách hàng từ Sổ chi tiết bán hàng MISA: nhập sổ bán hàng,
ghi và phân bổ khoản thu, theo dõi công nợ, lập biên bản đối chiếu. React + TypeScript + Vite trong
vỏ Electron. Giao diện gọi máy chủ HTTP cùng nguồn trong chế độ cục bộ, LAN hoặc máy trạm.
Mã tổ chức theo module nghiệp vụ. Component nhận dữ liệu và hành động qua hook hoặc props.

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
    api/client.ts      HTTP client bất đồng bộ dùng chung
    storage/           Lỗi lưu trữ và nhật ký giao diện
    ui/                Component dùng chung: Dialog, DateInput, StatusPill, Notice...
  styles/
    index.css          Điểm nhập CSS duy nhất, quy định thứ tự cascade
    foundation/        Font, token, reset/base và typography
    layout/            App shell và responsive toàn ứng dụng
    shared/            Style của component dùng chung
electron/              Vỏ desktop, máy trạm, cập nhật Windows (không chứa mã dữ liệu)
server/                Máy chủ một công ty (chạy được không cần Electron)
  database.cjs         SQLite và migration; books.cjs (sổ bán hàng, sổ thu); account-store.cjs (users, user_pages, sessions)
  access.cjs           Đăng nhập, phiên, giới hạn đăng nhập sai, kiểm quyền (requirePage)
  index.cjs            Ráp các route, mặc định cấm ngoài PUBLIC_ROUTES
  accounting-state.cjs Bộ đệm sổ và kết quả đã dựng, dùng chung cho các route tính tiền
  routes/              Mỗi màn hình một tệp: auth, settings, customers, employees, misa, dashboard,
                       receivables, reports, payments, audit
tests/                 Vitest cho src, node --test cho SQLite và LAN, smoke test cho Electron
```

## Quy tắc bắt buộc

1. Màu, cỡ chữ và kích thước shell lấy từ `styles/foundation/tokens.css`; không viết mã màu riêng trong component mới.
2. Model, repository và quy tắc nghiệp vụ nằm trong `domain`; UI và state màn hình nằm trong `features`.
3. Component nhận dữ liệu và callback qua props hoặc hook. Feature gọi repository trong `domain`.
   Repository gọi HTTP qua `shared/api/client.ts`.
4. Mọi phép tính tiền (công nợ, phân bổ, số dư đối chiếu) nằm trong `domain` và có kiểm thử; dashboard, báo cáo và màn hình thu tiền dùng chung, không tự tính lại.
5. Dữ liệu MISA được đọc qua adapter kiểm tra tiêu đề và định dạng số trước khi vào model chuẩn; nhập lại theo từng chứng từ, người dùng xem trước rồi mới ghi.
6. Chứng từ đã có khoản thu phân bổ không bị thay hay gỡ khi nhập lại sổ.
7. Ghi sổ bán hàng và sổ khoản thu dùng kiểm tra phiên bản (`importedAt`, `revision`) để không ghi đè thay đổi của máy khác.
8. Máy chủ yêu cầu phiên hợp lệ theo mặc định. Mỗi route nghiệp vụ khai báo quyền và phạm vi dữ liệu.
   Máy chủ kiểm tra quyền trước khi đọc nội dung gửi lên và áp dụng bộ lọc phạm vi ở máy chủ.
9. CSS riêng của feature đặt cạnh feature đó; CSS nền chỉ import qua `styles/index.css`.
10. Feature không import model, logic hoặc CSS của feature khác. Phần dùng chung chuyển vào `domain` hoặc `shared`.
11. Page chỉ điều phối state và use case; khối giao diện có trách nhiệm riêng tách vào `components`.
12. Khóa lưu trữ (`cong-no.*`) và migration thuộc repository/`server/database.cjs`. Không đổi khóa khi refactor; nếu bắt buộc phải đổi thì làm bằng bước migration (như v12).
13. Schema SQLite đổi bằng bước migration mới, chạy trong transaction; không sửa bước đã chạy. App tạo bản sao tệp trước mỗi lần nâng cấp.
14. Người thực hiện và công ty được lấy từ phiên và cấu hình máy chủ. Với thao tác nghiệp vụ thay đổi
    nhiều dữ liệu, lưu thay đổi và nhật ký cùng một giao dịch SQLite.
15. Trạng thái dạng nhãn dùng `shared/ui/StatusPill` với đúng năm ngữ nghĩa: `success`, `warning`, `info`, `neutral`, `danger`.

## Hướng phụ thuộc

```text
app ──> features ──> domain
 │          │           │
 └────────> shared <────┘

domain  -X-> features
feature -X-> feature khác
shared  -X-> features/domain nghiệp vụ

Electron ──> server ──> nghiệp vụ đã build và mô-đun SQLite thuần Node
```

`domain` phải chạy được không cần React. `shared/ui` chỉ chứa giao diện tổng quát. `server/start.cjs` chạy được bằng Node.js độc lập;
`server/` không phụ thuộc `electron/` (Electron chỉ khởi động máy chủ).

## Luồng dữ liệu

```text
Excel MISA ─> Web Worker đọc ô ─> adapter kiểm tra ─> xem trước theo chứng từ ─> Sổ bán hàng
                                                                                     │
Khoản thu ─> phân bổ vào hóa đơn ─> Sổ khoản thu ─────────────────────────────────────┤
                                                                                     v
                                     Công nợ phải thu · Dashboard · Biên bản đối chiếu
```

Có một đường dữ liệu: giao diện → HTTP cùng nguồn → `server/lan.cjs` → SQLite.
Mọi chế độ đều đăng nhập bằng cookie HttpOnly và được máy chủ kiểm tra quyền.

- **Desktop cục bộ:** tự mở máy chủ tại `127.0.0.1` với cổng tự chọn; mở trực tiếp
  `cong-no.sqlite` trong `userData` cũ. Không có preload hoặc IPC truy cập dữ liệu.
- **Máy chủ LAN:** mỗi tiến trình desktop phục vụ một công ty và một cổng. Chế độ Node.js có thể phục vụ nhiều cổng.
- **Máy trạm Electron:** tải giao diện và API từ cùng địa chỉ đã lưu trong `userData/workstation/server.json`.
  Kho SQLite và các tác vụ sao lưu thuộc máy chủ từ xa. Trình duyệt có thể mở cùng địa chỉ.
- **Cloudflare Tunnel:** mỗi máy chủ công ty nhận một tên miền HTTPS đã cấu hình. Connector chạy cùng máy
  và chuyển tới cổng loopback của công ty.
- **Phát triển:** `pnpm dev` tự mở máy chủ loopback, Vite chuyển tiếp `/api/` cùng nguồn.
  Dữ liệu phát triển ở `data/dev/cong-no.sqlite`. Vite cục bộ ở cổng 5176 có thể cấp phiên quản trị
  khi chưa có phiên. Vite chỉ gửi khóa nội bộ cho yêu cầu cùng nguồn từ loopback.
  `CONG_NO_DEV_AUTO_LOGIN=0` tắt tự đăng nhập để thử luồng thủ công.
  `pnpm preview` phục vụ bản build và dùng đăng nhập thủ công trên cùng kho phát triển.

Không có chế độ lưu nghiệp vụ trên trình duyệt. Thiếu endpoint hoặc mất kết nối thì báo lỗi,
không chuyển sang một bản dữ liệu khác. Bản sao lưu cục bộ tiếp tục dùng `companyId: null` để
khôi phục được tệp JSON cũ.

Các giai đoạn chuyển đổi nằm trong [docs/KE-HOACH-CHUYEN-KIEN-TRUC.md](docs/KE-HOACH-CHUYEN-KIEN-TRUC.md).

## Lưu trữ và an toàn dữ liệu

- Dữ liệu ghi theo envelope `{ version, data }`; máy chủ và SQLite là nguồn duy nhất, không dùng bản sao trên trình duyệt thay thế.
- Lỗi đọc dữ liệu báo lên toàn ứng dụng và không ghi đè gì. UI chỉ báo thành công sau khi repository xác nhận đã ghi.
- Sao lưu tự động 14 bản theo ngày, và bản JSON trước mỗi thao tác xóa/khôi phục.
- Schema hiện tại là **16** (`SCHEMA_VERSION` trong `server/database.cjs`). Bước v13 tách dòng bán hàng, khoản thu, phân bổ và đảo phiếu thành các bảng riêng. SQLite kiểm tra dữ liệu sau khi chuyển và hủy bước nâng cấp nếu có sai lệch.
  Bản sao lưu SQLite cũ được nâng cấp trên bản chép tạm khi đọc, tệp sao lưu gốc giữ nguyên.
- Bước v14 chuyển khối JSON tài khoản `cong-no.accounts.v1` sang các bảng `users` và `user_pages`,
  đối chiếu toàn bộ tài khoản trước khi bỏ khối cũ. Bảng `sessions` lưu bản băm token, tài khoản,
  phiên bản phiên và thời hạn; phiên còn hiệu lực được giữ khi khởi động lại máy chủ.
  Thông tin tài khoản, quyền, mật khẩu đã băm và các trường bổ sung được giữ nguyên khi nâng cấp.
- Bước v15 (chỉ có ở bản phát triển sau 0.1.3, chưa phát hành) thêm cột số dư đầu kỳ nhập tay cho khách hàng. Bước v16 bỏ nghiệp vụ này:
  số dư đã nhập được cất nguyên văn vào bảng `legacy_opening_balances` rồi cột bị xóa. Công nợ chỉ
  tính từ sổ bán hàng MISA và khoản thu; phân bổ cũ vào số dư đầu kỳ (nếu có) hiện là phân bổ chưa khớp
  sổ MISA và được hoàn tác ở màn Đối soát khoản thu.

## API và lưu danh mục

Máy chủ định tuyến theo phương thức và đường dẫn. `PUBLIC_ROUTES` gồm `POST /api/session` để đăng nhập
và `GET /api/branding` để lấy thông tin hiển thị trên màn hình đăng nhập. Mỗi route khai báo thẻ quyền và giới hạn dung lượng. Máy chủ kiểm quyền trước khi
đọc nội dung yêu cầu. Giao diện tải dữ liệu bất đồng bộ qua client dùng chung và dùng cookie HttpOnly.
Route `POST /api/dev-login` chỉ được đăng ký khi server nhận khóa nội bộ từ Vite lúc khởi động.

Khách hàng, nhân viên và phân công ghi theo bản ghi. Thao tác hàng loạt chỉ gửi các bản ghi được chọn
và được xử lý trong một giao dịch. Máy chủ kiểm tra xung đột trên từng hồ sơ liên quan.

Máy chủ lập bản xem trước MISA từ các dòng Excel đã đọc bằng worker. Khi xác nhận, máy chủ tính lại
kế hoạch và so mã xem trước trong cùng giao dịch ghi. Nhập bổ sung khách hàng, ghép mã vào sổ và ghi
nhật ký được lưu cùng nhau. Ghi khoản thu, phân bổ và hoàn tác dùng các route riêng, ghi sổ và nhật ký
trong cùng giao dịch.

Vite đóng gói nghiệp vụ TypeScript thành server/generated/domain.cjs. Máy chủ tính Dashboard, công nợ,
biên bản theo kỳ, danh sách khoản thu và ứng viên phân bổ. Các danh sách trả theo trang. Chi tiết dòng
hàng chỉ tải khi mở chứng từ. Các route báo cáo trả dữ liệu của một khách hàng theo kỳ được chọn.
Định dạng tệp sao lưu JSON phiên bản 1 tiếp tục dùng cho xuất và khôi phục.

## Phân quyền

| Phạm vi | Cách kiểm tra |
| --- | --- |
| Công ty | Công ty gắn với máy chủ HTTP và kho SQLite của cổng đang mở. |
| Phiên | `server/access.cjs` kiểm tra cookie, trạng thái tài khoản và phiên bản phiên. Phiên lưu ở bảng `sessions` (chỉ bản băm của token), còn sau khi khởi động lại máy chủ. |
| Thẻ | Vai trò và thẻ được cấp giới hạn route. Thẻ quản trị người dùng, cấu hình và nhật ký thuộc quản trị viên. |
| Bản ghi | Máy chủ áp dụng điều kiện của từng nghiệp vụ, gồm ràng buộc chứng từ, phân bổ và phiên bản khi ghi. |

## Thêm một màn hình mới

1. Thêm một dòng vào `src/domain/access/permissions.mjs` (mã thẻ và vai trò được cấp): đây là nguồn quyền
   duy nhất cho cả máy chủ và giao diện. Thêm `PageId` trong `src/types.ts`, mục điều hướng trong `src/app`.
2. Tạo `server/routes/<tên>.cjs` và đăng ký trong `server/index.cjs`. Mỗi route khai báo thẻ cần có và
   giới hạn dữ liệu gửi lên; đặt quy tắc kiểm tra ở route.
3. Dùng repository trong `src/domain/` gọi client HTTP. Đặt trang và các component trong `src/features/`.
4. Khi phải thay đổi SQLite, thêm migration mới, thử với kho cũ và giữ định dạng xuất sao lưu tương thích.
5. Kiểm thử route, quyền và nghiệp vụ. Chạy cả bộ số tiền chuẩn nếu thay đổi sổ, khoản thu, đối chiếu
   hoặc cách tổng hợp số liệu.

## An toàn và vận hành

- Mật khẩu dùng PBKDF2 với salt riêng. Giới hạn đăng nhập theo địa chỉ và theo tài khoản.
  Cookie phiên có `HttpOnly` và `SameSite=Strict`. Qua HTTPS hoặc Tunnel, cookie có thêm `Secure`.
- Như app cước phí, máy chủ desktop tự tạo tài khoản `admin` / `admin` khi kho chưa có tài khoản. Tài khoản
  bị buộc đặt mật khẩu đủ quy định trước khi gọi được route nghiệp vụ. Lệnh `lan:init-admin` vẫn cấp mật khẩu ngẫu nhiên.
- Khi dừng máy chủ (thoát hoặc cài cập nhật), yêu cầu đang dở có 3 giây để hoàn tất rồi mọi kết nối bị ngắt.
- Electron bật sandbox và context isolation, chặn quyền trình duyệt, popup và điều hướng sang nguồn khác.
  Trang cấu hình máy trạm đóng gói cục bộ chỉ được đọc và lưu địa chỉ. Renderer nghiệp vụ tải từ HTTP không có preload.
- Tên miền Tunnel phải khớp cài đặt của công ty. Máy chủ chỉ dùng `CF-Connecting-IP` cho yêu cầu từ
  loopback có `Host` đã khai báo và `X-Forwarded-Proto: https`. Máy chạy connector là ranh giới tin cậy.
  Cấu hình Cloudflare Access khi cần giới hạn danh tính bên ngoài. Giữ cổng HTTP gốc trong LAN hoặc trên loopback.
- Nhật ký vận hành theo chế độ, ghi JSON Lines theo ngày UTC, giữ 30 ngày và tối đa 5 MB mỗi ngày.
  Chỉ ghi thời điểm, mức độ, mã sự kiện và mã lỗi. Nhật ký thao tác nghiệp vụ vẫn ở SQLite.
- Kênh cập nhật Windows mặc định dùng GitHub Releases qua HTTPS, được bật trong bộ cài bởi
  `electron/build-windows.mjs`. GitHub Actions kiểm tra tag/phiên bản, kiểm thử, build và công bố
  bộ cài cùng `.blockmap`/`latest.yml` sau khi tải đủ tệp. Có thể cấu hình chứng thư bằng secrets
  để ký mã; nguồn HTTPS riêng qua `CONG_NO_UPDATE_URL`/`CONG_NO_UPDATE_PUBLISHER` vẫn bắt buộc ký.
  App kiểm tra định kỳ, tải nền, kiểm tra chữ ký khi có cấu hình nhà phát hành và đợi người dùng xác nhận cài.
  Đóng các phiên khác trước khi cài và
  dừng máy chủ của phiên hiện tại trước khi chạy trình cài.

## Giới hạn hiện tại

- App nhận mẫu Sổ chi tiết bán hàng MISA có tiêu đề cột đã biết.
- Máy trạm cần kết nối đến máy chủ để đọc và ghi. Với luồng xác thực Cloudflare Access chuyển sang
  tên miền của nhà cung cấp danh tính, mở ứng dụng bằng trình duyệt từ menu khay của máy trạm.
- HTTPS cho Tunnel do Cloudflare cung cấp. Tên miền và connector do đơn vị vận hành cấu hình.
  Kênh cập nhật GitHub có sẵn; chứng thư ký mã Windows hoặc nguồn cập nhật riêng cần cấu hình bổ sung.

`pnpm check` kiểm tra kiến trúc, nghiệp vụ, SQLite và LAN. `pnpm test:golden` đối chiếu số tiền qua API.
Sau `pnpm build`, `pnpm test:desktop` mở Electron với kho tạm, kiểm tra luồng cục bộ trên SQLite cũ
và kết nối máy trạm tới máy chủ qua HTTP.
