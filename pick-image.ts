import { get } from 'request-promise';
import { getRndInteger } from './global';
let tags = '#ig_engagements_bot #animalcruelty #petslover #petsittinglife #catsarethebest #catsdaily #petsfofos #petsdobrasil #animalcrossingmemes #petsuniversal #animalpolis #catslove #cats🐱 #catskills #petsoriginal #catsareawesome #cutechihuahua #animal_captures #animalcare #animallove #petstargram #petstagraam #cats_of_day #animalmemes #animalworld #catsgram'
export const igImage = async () => {
    // let page = getRndInteger(1, 9990)
    // console.log('page number:', page);
    let imageBuffer;
    const image = await get({
        url: `https://api.thecatapi.com/v1/images/search`, // random picture with 800x800 size
        json: true
    });
    if (!image?.length) {
        imageBuffer = await get({
            url: 'https://picsum.photos/800/800', // random picture with 800x800 size
            encoding: null, // this is required, only this way a Buffer is returned
        });
        console.log('not found');
        return {
            desc: tags,
            image: imageBuffer
        };
    }
    let item = image[0]
    imageBuffer = await get({
        url: item?.url,
        encoding: null, // this is required, only this way a Buffer is returned
    });
    return {
        desc: tags,
        image: imageBuffer
    };
}
