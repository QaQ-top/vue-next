
/**
 * @description 异步睡眠
 * @author (Set the text for this tag by adding docthis.authorName to your settings file.)
 * @date 2021-12-10
 * @export
 * @param {number} tiem 睡眠时间
 * @returns 
 */
export function seept(tiem: number) {
  return new Promise((resolve, reject) => {
    setTimeout(() => resolve(true), tiem);
  })
};
