# Kế hoạch chuyển sang kiến trúc của app cước phí

Cập nhật: 20/11/2026. Schema SQLite hiện tại: **14**. Mục tiêu: app công nợ có **một đường dữ liệu duy nhất qua máy chủ** như app
"Quản lý cước phí", nhưng giữ nguyên phần tính tiền TypeScript đã có kiểm thử.

## Vì sao phải chuyển

| | App công nợ trước chuyển đổi (giai đoạn 0) | App cước phí (đích đến) |
|---|---|---|
| Đường dữ liệu | Ba nhánh: trình duyệt (localStorage/IndexedDB), desktop (Electron gọi thẳng SQLite), LAN (`server/lan.cjs`) | Một đường: giao diện, kể cả trong Electron, gọi HTTP tới máy chủ nội bộ |
| Nơi tính toán | Trình duyệt tải **cả sổ** rồi tự tính công nợ, phân bổ, báo cáo | Máy chủ tính, lọc và phân trang |
| Lưu trữ sổ | Sổ bán hàng và sổ khoản thu là **một khối JSON** trong `app_datasets` | Mỗi loại dữ liệu một bảng |
| API | Một điểm vào, máy trạm gửi tên thao tác và gửi lại cả danh sách | REST theo route, một HTTP client duy nhất |
| Phân quyền | Máy chủ so cả danh sách cũ/mới để đoán quyền; bản desktop không qua lớp kiểm tra này | Mặc định cấm, kiểm quyền theo từng route; desktop cũng đi qua máy chủ |

Hệ quả ở đầu kế hoạch: kiểm tra dữ liệu bị lặp ở hai nơi, phải tải nguyên sổ (có bộ đệm `datasetCache`
để đỡ chậm), danh mục trên LAN còn đọc đồng bộ, logic desktop và LAN có thể lệch nhau.

## Nguyên tắc cho mọi giai đoạn

- **Số tiền không được đổi.** Có bộ test "số tiền chuẩn" lấy từ dữ liệu thật; mọi giai đoạn phải ra
  đúng từng đồng.
- Mỗi giai đoạn tự đứng được và phát hành riêng được.
- Đổi cấu trúc dữ liệu chỉ bằng bước migration mới, app tự sao tệp trước khi nâng cấp.
- Logic tính tiền ở `src/domain` được dùng chung cho máy chủ, không viết lại bằng JavaScript.

## Giai đoạn 0. Dọn nền (nhỏ)

Đã xong toàn bộ:
- [x] Xóa module của app chiết khấu cũ (sản phẩm, chính sách, đơn hàng, đối soát cũ) và test của chúng.
- [x] Gỡ lệnh SQLite cũ, bỏ trường người nhận, xóa bảng cũ và đổi khóa `mkt-cost.*` → `cong-no.*` (migration v12).
- [x] Đổi tên định danh app, cầu nối `congNoDatabase`, header `X-Cong-No-*`, biến môi trường `CONG_NO_LAN_*`.
- [x] Viết lại `ARCHITECTURE.md`.

- [x] Commit trạng thái hiện tại (nhánh `chuyen-kien-truc`).
- [x] **Test số tiền chuẩn** (`tests/golden-numbers.test.ts`): bản sao lưu mẫu
  `tests/fixtures/golden-backup.json` gồm 6 khách, 16 chứng từ 2025–2026, 10 khoản thu; các số chuẩn
  trong `golden-numbers.json` (Dashboard tại 6 ngày chốt, công nợ từng hóa đơn, 18 biên bản đối chiếu)
  đã đối chiếu tính tay. Test chạy cả đường đi qua SQLite (khôi phục rồi xuất lại).
  Chưa có dữ liệu thật; khi có bản sao lưu thật nên bổ sung thêm một bộ số chuẩn từ đó.

## Giai đoạn 1. Một đường dữ liệu (vừa) — đã xong 19/11/2026

- [x] Bản desktop luôn tự chạy máy chủ ngay trong app (`127.0.0.1`, hoặc `0.0.0.0` khi làm máy chủ LAN);
  giao diện gọi HTTP như máy trạm.
- [x] Gỡ cầu nối SQLite trong `preload` (`congNoDatabase`), bỏ chế độ chỉ chạy trên trình duyệt.
  Chạy dev dùng máy chủ ở chế độ loopback như app cước phí.
- [x] Tệp `cong-no.sqlite` của bản desktop có cùng cấu trúc với tệp của máy chủ nên dùng thẳng được.
- [x] Bản desktop dùng một máy cũng đăng nhập (dùng luồng tạo admin lần đầu đã có).

**Xong khi:** `src/domain` không còn nhánh `getDatabaseBridge`/`lanEndpoint()`; số tiền chuẩn khớp;
chạy thử Electron và LAN đều được.

Đã kiểm chứng:
- `pnpm check`: lint, TypeScript, kiểm tra cú pháp Electron, 127 test Vitest, 14 test SQLite,
  7 test LAN/phân quyền đều đạt.
- Test số tiền chuẩn thêm vòng khôi phục/xuất qua HTTP thật với SQLite tạm, không sửa số chuẩn.
- `pnpm build` và `pnpm test:desktop`: Electron thật mở bằng HTTP loopback, đọc tệp
  `cong-no.sqlite` có sẵn, không có bridge, bắt buộc đăng nhập/đổi mật khẩu và khôi phục phiên cookie.
- Dev: giao diện đăng nhập hiển thị được; proxy cho phép cùng nguồn, từ chối nguồn khác (403)
  và từ chối đọc sổ khi chưa đăng nhập (401).

Cách chạy mới: `pnpm dev:init-admin` một lần, sau đó `pnpm dev`; kho phát triển riêng ở `data/dev`.
Desktop cục bộ dùng nguyên đường dẫn dữ liệu cũ, bản sao lưu JSON giữ `companyId: null`.
Không thay schema SQLite ở giai đoạn này.

## Giai đoạn 2. API theo route (lớn) — đã xong 19/11/2026

- [x] Dùng mẫu bộ định tuyến của app cước phí (`server/http.cjs`, `server/index.cjs`): `PUBLIC_ROUTES` mặc định
  cấm, mỗi route khai báo thẻ quyền và giới hạn dung lượng gửi lên, lỗi có mã HTTP.
- [x] Một HTTP client duy nhất `src/shared/api/client.ts`. Mọi đọc dữ liệu thành bất đồng bộ: hết XHR
  đồng bộ, các trang có trạng thái đang tải.
- [x] Khách hàng, nhân viên, phân công sửa theo từng bản ghi (POST/PATCH/DELETE) → bỏ việc so cả danh sách
  để đoán quyền (`requireCustomerChangePermission`) và revision của cả danh mục.
- [x] Giữ đăng nhập bằng cookie HttpOnly hiện tại.

Máy chủ kiểm quyền và giới hạn dung lượng theo từng route. Giao diện tải bất đồng bộ qua một client chung.
Các thao tác nhập khách hàng và giao nhiều khách hàng gửi đúng các bản ghi cần xử lý trong một giao dịch.
Chỉnh sửa dùng phiên bản từng hồ sơ để phát hiện xung đột. Kết thúc phân công giữ lại lịch sử.

Kiểm thử HTTP bao phủ ranh giới đăng nhập của từng route, quyền theo thẻ, giới hạn dung lượng và
xung đột khi ghi. Bộ số tiền chuẩn đọc lại danh mục và hai sổ qua các route mới sau khi khôi phục SQLite.
Cả 5 test số tiền chuẩn đều đạt với cùng tệp số chuẩn.

## Giai đoạn 3. Bảng riêng cho sổ (lớn) — đã xong 19/11/2026

- [x] Migration v13: bảng `sales_lines` (đánh chỉ mục theo mã khách, ngày, chứng từ), `receipts`,
  `allocations`, `allocation_lines`, `reversals`. Khi nâng cấp kiểm tra tổng tiền khớp với khối JSON
  cũ, lệch thì hủy.
- [x] Nhập MISA: máy trạm đọc Excel bằng worker như hiện tại; máy chủ có bước xem trước và bước xác nhận,
  ghi trong một giao dịch.
- [x] Ghi khoản thu, phân bổ, đảo phiếu theo từng thao tác, ghi nhật ký trong cùng giao dịch.
- [x] Định dạng tệp sao lưu JSON giữ nguyên để bản sao lưu cũ vẫn khôi phục được.

Migration kiểm tra lại từng bản ghi và số tiền trước khi xóa hai khối JSON. Nếu sai lệch, SQLite
hủy giao dịch và giữ phiên bản cũ. Đã kiểm thử nâng v12, hủy khi sai lệch, đọc bản sao SQLite v12
và khôi phục tệp JSON cũ. Hai sổ được lưu hoàn toàn trong các bảng riêng.

## Giai đoạn 4. Máy chủ tính, máy trạm hiển thị (lớn) — đã xong 19/11/2026

- [x] Đóng gói `src/domain` cho máy chủ (build SSR bằng Vite ra `server/generated/domain.cjs`) để dùng
  chung công thức và chung test.
- [x] Route có lọc và phân trang ở máy chủ: công nợ phải thu, hóa đơn từng khách, Dashboard, biên bản
  đối chiếu, danh sách khoản thu, ứng viên phân bổ.
- [x] Bỏ `datasetCache` và việc tải nguyên sổ về máy trạm. Thêm script đo hiệu năng như
  `tests/performance` của app cước phí.

Đã kiểm thử đủ 6 ngày chốt của Dashboard, số dư và phân bổ theo hóa đơn, cùng 18 biên bản đối chiếu
qua API. Báo cáo tải theo khách hàng và kỳ đã chọn để in hoặc xuất Excel. Dòng hàng của từng hóa đơn
chỉ tải khi mở chi tiết. Lệnh benchmark là pnpm test:performance. Mẫu 50.000 dòng trả trang Dashboard
khoảng 1,8 KB và 10 khách hàng công nợ khoảng 3,4 KB.

## Sửa sau rà soát giai đoạn 2–4 (20/11/2026)

- Giới hạn đăng nhập sai tính lượt trước khi băm mật khẩu: gửi song song cũng bị chặn.
- Khoản thu mang mã do máy trạm tạo: gửi lại không ghi thêm. Hủy khoản thu và hoàn tác phân bổ phải
  kèm phiên bản sổ đang xem. Ghi sổ thu chỉ được thêm dòng hoặc thêm đảo phiếu.
- Nâng cấp v13 chấp nhận sổ có trường lạ hoặc ký tự lỗi nếu số tiền khớp, cất nguyên văn bản JSON cũ
  vào bảng `legacy_books`; sổ `null` được cất lại thay vì làm hỏng việc mở kho. Mở lại sau lỗi không
  tạo thêm bản sao khi tệp chưa đổi; thông báo lỗi ghi rõ đường dẫn bản sao.
- Mọi lệnh chạy build `server/generated/domain.cjs` trước; thiếu bản build thì báo rõ cách sửa. Khi dev,
  sửa `src/domain` thì máy chủ tự build và nạp lại.
- Máy chủ giữ sẵn sổ đã gom theo khách hàng (theo phiên bản sổ và danh mục), nhóm theo ngày chốt và
  12 kỳ Dashboard gần nhất. Biên bản chỉ lấy dòng của đúng khách. Ghi sổ thu dùng lại bản sổ đã đọc.
  Với sổ 50.000 dòng: đổi kỳ Dashboard 5–16 ms, tìm hóa đơn phân bổ khoảng 20 ms, biên bản khoảng 25 ms,
  Dashboard sau khi ghi khoản thu khoảng 230 ms; lần đầu sau khi mở máy chủ hoặc nhập sổ khoảng 0,9 giây.
- Lọc "dòng không còn trong tệp" khi nhập MISA dùng kết quả xem trước máy chủ đang giữ, không gửi lại tệp.

## Giai đoạn 5. Hoàn thiện (tùy chọn)

Ghi log ra tệp, tự cập nhật (`electron-updater`), máy desktop làm máy trạm của máy chủ khác, truy cập
từ xa qua Cloudflare Tunnel, `ARCHITECTURE.md` với đầy đủ quy tắc như app cước phí.

Đã triển khai máy trạm Electron, nhật ký vận hành theo ngày, kênh cập nhật Windows và
tên miền Tunnel cấu hình theo công ty. Xem hướng dẫn vận hành trong [README.md](../README.md) và quy
tắc triển khai trong [ARCHITECTURE.md](../ARCHITECTURE.md). Kiểm thử cục bộ dùng máy chủ, cấu hình
proxy và bộ cập nhật mô phỏng. Kênh cập nhật mặc định dùng GitHub Releases; chứng thư ký mã,
nguồn cập nhật riêng và tên miền Tunnel do đơn vị vận hành cấu hình khi cần.

## Đồng bộ nốt với app cước phí (20/11/2026)

- Lớp SQLite chuyển từ `electron/` sang `server/` (`database.cjs`, `books.cjs`); `server/` không còn phụ thuộc `electron/`.
- Schema v14: tài khoản vào bảng `users` và `user_pages` (thay khối JSON); phiên đăng nhập lưu ở bảng
  `sessions`, chỉ giữ bản băm token, nên khởi động lại hay cập nhật máy chủ không đăng xuất người dùng.
- Route tách mỗi màn hình một tệp trong `server/routes/` (auth, settings, customers, employees, misa,
  dashboard, receivables, reports, payments, audit); bộ đệm sổ dùng chung ở `server/accounting-state.cjs`.
- Danh sách thẻ và quyền theo vai trò chỉ còn một nguồn: `src/domain/access/permissions.mjs`, dùng cho cả
  máy chủ và giao diện.

### Kiểm chứng schema 14 (20/11/2026)

- `pnpm check`: lint, TypeScript, kiểm tra cú pháp và toàn bộ 157 test đều đạt
  (122 Vitest, gồm bộ số tiền chuẩn; 20 SQLite; 15 LAN/phân quyền/vận hành).
- Kiểm tra cú pháp bổ sung cho toàn bộ 43 module `.cjs`/`.mjs` trong `server/` và `electron/`
  (không tính mã được sinh tự động) đều đạt.
- `pnpm build` thành công; còn cảnh báo kích thước chunk ExcelJS lớn hơn 500 kB.
- `pnpm test:desktop`: cả hai smoke test Electron cục bộ và máy trạm đều đạt, gồm đăng nhập,
  đổi mật khẩu, khôi phục phiên cookie và không có cầu nối truy cập SQLite từ giao diện.
- `pnpm test:performance`: đạt với 50.000 dòng bán hàng và 500 khách hàng; Dashboard lần đầu
  khoảng 909 ms, đọc lại khoảng 11 ms; trang 10 khách công nợ khoảng 3,4 KB.

## Quyết định đã chốt (19/11/2026)

| Câu hỏi | Quyết định |
|---|---|
| Desktop dùng một máy cũng bắt buộc đăng nhập? | Có, như app cước phí |
| Chạy các công ty thế nào? | Như app cước phí: mỗi công ty một máy chủ, một tệp dữ liệu, một tiến trình và một cổng (Nam Hưng Việt, Tường Khuê, Winbio 3300 trên máy của mình; Naviva 3301 trên máy chung với Nam Hưng Việt) |
| Bỏ chế độ chỉ chạy trên trình duyệt? | Có |
| Đăng nhập bằng cookie HttpOnly (hiện tại) hay token trong `sessionStorage` (app cước phí)? | Giữ cookie, an toàn hơn |

## Rủi ro

- **Sai số tiền khi chuyển logic:** chặn bằng test số tiền chuẩn ở mọi giai đoạn.
- **Hỏng dữ liệu khi đổi cấu trúc:** migration trong giao dịch, kiểm tra tổng trước khi ghi, sao tệp trước khi nâng cấp.
- **Gián đoạn máy trạm:** máy chủ và máy trạm luôn cùng phiên bản vì máy trạm tải giao diện từ máy chủ; nâng cấp ngoài giờ làm việc.
